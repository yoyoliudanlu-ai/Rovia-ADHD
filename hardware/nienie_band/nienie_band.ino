/*
============================================================================
 手环模块 - 高级健康监测模块版 + 专注按键 + 蜂鸣报警 (手机中心架构)
============================================================================
* 硬件接线:
* - 传感器 TX -> D5 (GPIO7)  [ESP32的RX]
* - 传感器 RX -> D4 (GPIO6)  [ESP32的TX]
* - 蜂鸣器 -> D6 (GPIO21)
* - 电池ADC -> D2 (GPIO4)
* - 专注按键 -> D3 (GPIO5, 接GND触发)
* 
* 协议说明:
* 波特率 38400, 发送 0x8A 启动，接收 88 字节固定包 (0xFF 包头)
* 
* BLE 数据格式 (合并发送):
* - 特征值 UUID: beb5483e-36e1-4688-b7f5-ea0734b5e495
* - 数据长度: 2 字节
* - byte[0]: 心率值 (0-255, 无效时为0)
* - byte[1]: 专注状态 (0x00=关闭, 0x01=开启)
============================================================================
*/

#include <Arduino.h>
#include <HardwareSerial.h>

#include <BLEDevice.h>          
#include <BLEServer.h>          
#include <BLEUtils.h>           
#include <BLE2902.h>            

// ==================== 1. 引脚与串口配置 ====================
#define SENSOR_RX_PIN 7         // D5 (接模块的TX)
#define SENSOR_TX_PIN 6         // D4 (接模块的RX)

#define BUZZER_PIN 21           // D6
#define BATTERY_ADC_PIN 4       // D2
#define BTN_FOCUS_PIN 5         // D3

HardwareSerial SensorSerial(1); // 使用串口1连传感器

// ==================== 2. 全局参数配置 ====================
#define HEART_RATE_UPDATE_INTERVAL 1000 // 每1秒向APP更新一次心率
#define DEBOUNCE_DELAY 50              

#define BUZZER_DURATION 500           
#define BUZZER_REPEAT_COUNT 3          
#define BUZZER_REPEAT_INTERVAL 300     
#define BUZZER_FREQUENCY 2000          

// ==================== 3. BLE UUID定义 ====================
#define BAND_SERVICE_UUID     "4fafc202-1fb5-459e-8fcc-c5c9c331914b"
#define COMBINED_CHAR_UUID    "beb5483e-36e1-4688-b7f5-ea0734b5e495"   //HEART_RATE_CHAR_UUID+FOCUS_STATE_CHAR_UUID
#define ALARM_CMD_CHAR_UUID   "beb5483e-36e1-4688-b7f5-ea0734b5e496" 
#define BAND_DEVICE_NAME "Band-001"

// ==================== 4. 全局变量 ====================
unsigned long lastBleSendTime = 0; 
int heartRateValue = 0;         
int spO2Value = 0; // 血氧备用
int hrv_sdnnValue = 0;
bool heartRateValid = false;    
unsigned long lastSensorDataTime = 0; 

bool isFocusMode = false;       
bool isBeeping = false;         
unsigned long beepStartTime = 0; 
int currentBeepOnTime = 0;      
int currentBeepOffTime = 0;     
int currentBeepTotalCount = 0;  

int btnState, lastBtnState = HIGH;   
unsigned long lastDebounceTime = 0;  

BLEServer* pServer = NULL; 
BLECharacteristic* pCombinedChar = NULL;
bool appDeviceConnected = false; 
bool oldAppDeviceConnected = false;

uint8_t rxBuffer[88]; // 传感器数据缓存区

// ==================== 5. 函数声明 ====================
void buzzer_stop();
void start_alarm_beep();
void start_notify_beep();
void ble_send_combined_data();  // 发送合并数据 (心率+专注状态)

// ==================== 6. BLE 回调 ====================
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        appDeviceConnected = true;
        Serial.println("[BLE] 手机 APP 已连接");
    };

    void onDisconnect(BLEServer* pServer) {
        appDeviceConnected = false;
        Serial.println("[BLE] 手机 APP 已断开");
        if (isFocusMode) start_alarm_beep(); // 专注模式下断开，触发蜂鸣器
    }
};

class MyAlarmCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        uint8_t* data = pCharacteristic->getData();
        size_t len = pCharacteristic->getLength();
        if (len > 0) {
            if (data[0] == 0x01) {
                Serial.println("[BLE] 收到 APP 报警指令0x01");
                start_alarm_beep(); // 收到 0x01：走远报警
            } else if (data[0] == 0x02) {
                Serial.println("[BLE] 收到 APP 报警指令0x02");
                start_notify_beep(); // 收到 0x02：消息滴滴
            }
        }
    }
};

// ==================== 7. setup() ====================
void setup() {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
    
    Serial.begin(115200);
    delay(2000);
    Serial.println("\n--- 手环模块启动 (高级健康监测版) ---");
    // 1. 初始化传感器串口
    SensorSerial.begin(38400, SERIAL_8N1, SENSOR_RX_PIN, SENSOR_TX_PIN);
    SensorSerial.setTimeout(100); 

    Serial.println("[Sensor] 发送 0x8A 唤醒指令...");
    SensorSerial.write(0x8A);
    delay(500);

    // 2. 硬件初始化
    pinMode(BTN_FOCUS_PIN, INPUT_PULLUP);
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);

    // 3. BLE 初始化
    BLEDevice::init(BAND_DEVICE_NAME);
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());
    BLEService* pService = pServer->createService(BAND_SERVICE_UUID);

    // 创建合并特征值 (读+通知)
    pCombinedChar = pService->createCharacteristic(
        COMBINED_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    pCombinedChar->addDescriptor(new BLE2902());

    // 报警指令特征值
    pService->createCharacteristic(ALARM_CMD_CHAR_UUID, BLECharacteristic::PROPERTY_WRITE)
            ->setCallbacks(new MyAlarmCallbacks());

    pService->start();
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(BAND_SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    BLEDevice::startAdvertising();

    Serial.println("=== 系统初始化完成 ===");

    digitalWrite(BUZZER_PIN, HIGH);
    delay(100);
    digitalWrite(BUZZER_PIN, LOW);
}

// ==================== 8. loop() ====================
void loop() {
    unsigned long currentTime = millis();

    // 1. 专注按键逻辑
    int reading = digitalRead(BTN_FOCUS_PIN);
    if (reading != lastBtnState) lastDebounceTime = currentTime;
    if ((currentTime - lastDebounceTime) > DEBOUNCE_DELAY) {
        if (reading != btnState) {
            btnState = reading;
            if (btnState == LOW) { 
                isFocusMode = !isFocusMode; 
                Serial.println(isFocusMode ? "[按键] 专注模式 ON" : "[按键] 专注模式 OFF");
                if (!isFocusMode) buzzer_stop(); 
                ble_send_combined_data();   // 专注状态改变，立即发送合并数据
            }
        }
    }
    lastBtnState = reading;

    // 传感器看门狗
    if (currentTime - lastSensorDataTime > 3000) {
        Serial.println("[Sensor] 等待数据中，发送 0x8A 唤醒指令...");
        SensorSerial.write(0x8A);
        lastSensorDataTime = currentTime;
        while(SensorSerial.available()) SensorSerial.read();
    }

    // 2. 读取传感器数据
    if (SensorSerial.available() >= 88) {
        if (SensorSerial.peek() == 0xFF) {
            SensorSerial.readBytes(rxBuffer, 88);
            lastSensorDataTime = currentTime; 
            
            int hr = rxBuffer[65];
            int spo2 = rxBuffer[66];
            int hrv_sdnn = rxBuffer[76];

            if (hr > 30 && hr < 220) {
                heartRateValue = hr;
                spO2Value = spo2;
                hrv_sdnnValue = hrv_sdnn;
                heartRateValid = true;
                Serial.printf("❤ 心率：%d, HRV: %d", hr, hrv_sdnn);
            } else {
                heartRateValid = false;
            }
        } else {
            SensorSerial.read();
        }
    }

    // 3. 定时发送合并数据（心率+专注状态）
    if (currentTime - lastBleSendTime >= HEART_RATE_UPDATE_INTERVAL) {
        lastBleSendTime = currentTime;
        if (appDeviceConnected && heartRateValid) {
            ble_send_combined_data();  // 发送当前心率和专注状态
        }
    }

    // 4. 蜂鸣器状态机
    if (isBeeping) {
        unsigned long elapsed = millis() - beepStartTime;
        int cycleTime = currentBeepOnTime + currentBeepOffTime;
        int cycle = elapsed / cycleTime;
        int timeInCycle = elapsed % cycleTime;

        if (cycle >= currentBeepTotalCount) {
            buzzer_stop();
        } else {
            digitalWrite(BUZZER_PIN, (timeInCycle < currentBeepOnTime) ? HIGH : LOW);
        }
    }

    // 5. BLE 重连管理
    if (!appDeviceConnected && oldAppDeviceConnected) {
        delay(500);
        pServer->startAdvertising();
        oldAppDeviceConnected = appDeviceConnected;
    }
    if (appDeviceConnected && !oldAppDeviceConnected) {
        oldAppDeviceConnected = appDeviceConnected;
        ble_send_combined_data(); // 连接成功后立即发送当前状态
    }
}

// ==================== 9. 功能函数 ====================

void buzzer_stop() {
    isBeeping = false;
    digitalWrite(BUZZER_PIN, LOW);
}

void start_alarm_beep() {
    isBeeping = true;
    beepStartTime = millis();
    currentBeepOnTime = 500;
    currentBeepOffTime = 300;
    currentBeepTotalCount = 3;
    Serial.println("[报警] 滴-滴-滴 (走远/断连)");
}

void start_notify_beep() {
    isBeeping = true;
    beepStartTime = millis();
    currentBeepOnTime = 100;
    currentBeepOffTime = 100;
    currentBeepTotalCount = 2;
    Serial.println("[提醒] 滴滴！ (收到新消息)");
}

// 合并发送：2字节 [心率, 专注状态]
void ble_send_combined_data() {
    if (!appDeviceConnected) return;
    
    uint8_t data[2];
    data[0] = (uint8_t)hrv_sdnnValue;      // 心率值（若无效则发送上次有效值或0）
    data[1] = isFocusMode ? 0x01 : 0x00;   // 专注状态
    
    pCombinedChar->setValue(data, 2);
    pCombinedChar->notify();
    
    Serial.printf("[BLE] 发送合并数据: HRV=%d, 专注=%d\n", data[0], data[1]);
}