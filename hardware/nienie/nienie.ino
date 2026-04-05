/*
============================================================================
 捏捏模块 - 压力采集 + 假休眠机制 (极速Demo版)
============================================================================
* 硬件平台: Seeed XIAO ESP32-C3
*
* 功能概述:
* 1. FSR压力传感器采集 - 分离时每20ms读取一次ADC值
* 2. BLE单连接 (极高稳定性) - 仅连接手机APP
* 3. 假休眠机制 - 贴合时停止传感器读取与蓝牙发送，大幅降低功耗
*
* 数据流向:
* 捏捏 --(压力数据 & 贴合状态)--> 手机APP
* (注: 手环现在直接连手机APP，不再与捏捏直连，提升整体稳定性)
*
* 引脚定义:
* - D1 (GPIO3): FSR压力传感器ADC输入
* - D7 (GPIO20): 贴合检测（磁吸连接器Pin3）
============================================================================
*/

// ==================== 1. 引入库文件 ====================
#include <BLEDevice.h>    // BLE设备核心功能
#include <BLEServer.h>    // BLE服务器功能（作为从设备）
#include <BLEUtils.h>     // BLE工具函数
#include <BLE2902.h>      // BLE描述符（用于通知功能）

// ==================== 2. 全局配置与引脚定义 ====================

// ---------- 引脚定义 ----------
#define FSR_PIN 3         // GPIO3 (丝印D1) - FSR压力传感器ADC输入
#define ATTACH_PIN 20     // GPIO20 (丝印D7) - 贴合检测引脚 (连接磁吸连接器Pin3)

// ---------- 时间间隔配置 ----------
#define SAMPLE_INTERVAL 20      // FSR采样间隔: 20ms (50Hz)
#define BLE_UPDATE_INTERVAL 100 // BLE数据发送间隔: 100ms (10Hz)

// ---------- ADC配置 ----------
#define ADC_RESOLUTION 12       // ADC分辨率: 12位 (0-4095)
#define ADC_SAMPLES 4           // 采样次数: 4次取平均，减少噪声
#define ADC_ATTENUATION ADC_6db // ADC衰减: 6dB (测量范围0-1.5V)

// ==================== 3. BLE UUID定义 ====================
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b" // 主服务UUID
#define PRESSURE_CHAR_UUID  "beb5483e-36e1-4688-b7f5-ea0734b5e494" // 压力数据特征值UUID
#define ATTACH_CHAR_UUID    "6e400003-b5a3-f393-e0a9-e50e24dcca9e" // 贴合状态特征值UUID

// ==================== 4. 全局变量 ====================

// ---------- 时间记录 ----------
unsigned long lastSampleTime = 0;     
unsigned long lastBleUpdateTime = 0;  

// ---------- FSR压力数据 ----------
int fsrRawValue = 0;                  
int fsrFilteredValue = 0;             

// ---------- 贴合状态 ----------
bool isAttached = false;              // 当前贴合状态
bool lastAttachedState = false;       // 上一次的贴合状态 (用于检测状态变化)

// ---------- BLE相关变量 ----------
BLEServer* pServer = NULL;            
BLEService* pService = NULL;          
BLECharacteristic* pPressureChar = NULL; 
BLECharacteristic* pAttachChar = NULL;   

// 连接状态管理 (仅保留单连接，提升稳定性)
bool deviceConnected = false;   
bool oldDeviceConnected = false;

#define DEVICE_NAME "NieNie-001"            // BLE广播名称

// ==================== 5. BLE回调类 ====================
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("[BLE] 手机APP已连接!");
    };

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("[BLE] 手机APP已断开!");
    }
};

// ==================== 6. 功能函数声明 ====================
void fsr_init(); 
int fsr_read_average(uint8_t samples); 
void fsr_update(); 
void attach_init(); 
bool check_attached(); 
void ble_init(); 
void ble_setup_advertising(); 
void ble_notify_pressure(int value); 
void ble_notify_attach(bool attached); 
void ble_manage_connection(); 
void print_debug_info(); 

// ==================== 7. setup() ====================
void setup() {
    Serial.begin(115200);
    // 延迟等待串口初始化
    delay(2000); 

    Serial.println("\n========================================");
    Serial.println(" 捏捏模块启动 - NieNie-001");
    Serial.println("========================================");

    fsr_init();
    attach_init();
    ble_init();

    // 初始读取一次状态
    isAttached = check_attached();
    lastAttachedState = isAttached;

    Serial.println("\n=== 系统初始化完成 ===");
}

// ==================== 8. loop() - 主循环 ====================
void loop() {
    // --- 1. 贴合状态监测与边缘触发 ---
    isAttached = check_attached();
    
    if (isAttached != lastAttachedState) {
        // 状态发生了改变 (吸附 <-> 取下)
        Serial.print("[状态改变] 当前状态: ");
        Serial.println(isAttached ? "已贴合 (进入休眠)" : "已分离 (开始工作)");
        
        if (deviceConnected) {
            ble_notify_attach(isAttached); // 通知APP当前贴合状态
            if (isAttached) {
                ble_notify_pressure(0);    // 刚刚吸附时，发一个压力0给APP清空UI
            }
        }
        lastAttachedState = isAttached;
        delay(50); // 简单防抖
    }

    // --- 2. 软件假休眠拦截器 (核心) ---
    if (isAttached) {
        // 如果贴合在手环上：啥也不干，直接return，不读取ADC，不发蓝牙数据
        ble_manage_connection(); // 仅保持蓝牙重连逻辑运转
        delay(100);              // 降低空转频率，省电
        return;                  // 🚀 核心：跳过后续所有工作！
    }

    // ==========================================
    // 以下代码只有在【取下把玩（分离）】时才会执行
    // ==========================================
    
    unsigned long currentTime = millis();

    // --- 3. FSR压力采集 ---
    if (currentTime - lastSampleTime >= SAMPLE_INTERVAL) {
        lastSampleTime = currentTime;
        fsr_update(); 
    }

    // --- 4. BLE数据发送 ---
    if (currentTime - lastBleUpdateTime >= BLE_UPDATE_INTERVAL) {
        lastBleUpdateTime = currentTime;
        
        if (deviceConnected) {
            ble_notify_pressure(fsrFilteredValue);
        }
        print_debug_info();
    }

    // --- 5. BLE连接管理 ---
    ble_manage_connection();
}

// ==================== 9. 功能函数实现 ====================
void fsr_init() {
    analogReadResolution(ADC_RESOLUTION);
    analogSetAttenuation(ADC_ATTENUATION);
    fsrRawValue = analogRead(FSR_PIN);
}

int fsr_read_average(uint8_t samples) {
    long sum = 0;
    for (int i = 0; i < samples; i++) {
        sum += analogRead(FSR_PIN);
        delayMicroseconds(100); 
    }
    return sum / samples;
}

void fsr_update() {
    fsrRawValue = fsr_read_average(ADC_SAMPLES);
    // 一阶低通滤波
    fsrFilteredValue = fsrFilteredValue * 0.7 + fsrRawValue * 0.3;
}

void attach_init() {
    pinMode(ATTACH_PIN, INPUT_PULLUP);
}

bool check_attached() {
    // 磁吸Pin3接GND时为LOW（表示贴合）
    return (digitalRead(ATTACH_PIN) == LOW);
}

void ble_init() {
    BLEDevice::init(DEVICE_NAME);
    // 设置MTU，优化数据传输
    BLEDevice::setMTU(23); 
    
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());
    pService = pServer->createService(SERVICE_UUID);

    // 压力数据特征值
    pPressureChar = pService->createCharacteristic(
        PRESSURE_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    pPressureChar->addDescriptor(new BLE2902());

    // 贴合状态特征值
    pAttachChar = pService->createCharacteristic(
        ATTACH_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    pAttachChar->addDescriptor(new BLE2902());

    pService->start();
    ble_setup_advertising();
}

void ble_setup_advertising() {
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06); // 帮助iPhone快速连接
    pAdvertising->setMaxPreferred(0x12);
    BLEDevice::startAdvertising();
}

void ble_notify_pressure(int value) {
    uint8_t data[2];
    data[0] = value & 0xFF;         
    data[1] = (value >> 8) & 0xFF;  
    pPressureChar->setValue(data, 2);
    pPressureChar->notify();
}

void ble_notify_attach(bool attached) {
    uint8_t data[1];
    data[0] = attached ? 0x01 : 0x00;
    pAttachChar->setValue(data, 1);
    pAttachChar->notify();
}

void ble_manage_connection() {
    // 掉线重连逻辑
    if (!deviceConnected && oldDeviceConnected) {
        delay(500); 
        pServer->startAdvertising(); 
        Serial.println("[BLE] 断开连接，重新开始广播...");
        oldDeviceConnected = deviceConnected;
    }
    // 刚连接上时的逻辑
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
    }
}

void print_debug_info() {
    static unsigned long lastPrintTime = 0;
    if (millis() - lastPrintTime < 1000) return;
    lastPrintTime = millis();

    Serial.print("[工作态] FSR值: ");
    Serial.print(fsrFilteredValue);
    Serial.print(" | 蓝牙: ");
    Serial.println(deviceConnected ? "已连接" : "等待连接");
}