class SidecarClient {
  constructor({ url, onEvent, onConnectionChange }) {
    this.url = url;
    this.onEvent = onEvent;
    this.onConnectionChange = onConnectionChange;
    this.socket = null;
    this.reconnectTimer = null;
    this.closed = false;
  }

  connect() {
    if (!this.url || this.closed) {
      return;
    }

    try {
      this.socket = new WebSocket(this.url);
    } catch (error) {
      this.onConnectionChange(false, error);
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      this.onConnectionChange(true);
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(String(event.data));
        this.onEvent(data);
      } catch (error) {
        console.warn("[sidecar] failed to parse event", error);
      }
    });

    this.socket.addEventListener("close", () => {
      this.onConnectionChange(false);
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", (error) => {
      this.onConnectionChange(false, error);
    });
  }

  scheduleReconnect() {
    if (this.closed) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 3000);
  }

  destroy() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

module.exports = {
  SidecarClient
};
