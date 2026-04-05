import time
from supabase import create_client

# 你的配置
url = "https://ahfrsxxeogltcujxfmjw.supabase.co"
key = "sb_publishable_lFBtCL1TQhXmSV1uYGx8bQ_gauJtUQ9"
user_uuid = "49d91ddd-a62d-488e-90b1-f80bd5434987"

supabase = create_client(url, key)

def send_mock_data():
    data = {
        "user_id": user_uuid,
        "hrv": 72.5,
        "stress_level": 35,
        "distance_meters": 0.8,
        "is_at_desk": True
    }
    
    try:
        # 执行插入
        response = supabase.table("telemetry_data").insert(data).execute()
        print(f"数据发送成功！当前时间: {time.strftime('%H:%M:%S')}")
        print(f"服务器返回: {response.data}")
    except Exception as e:
        print(f"发送失败，请检查 RLS 策略或网络: {e}")

if __name__ == "__main__":
    # 运行一次测试
    send_mock_data()