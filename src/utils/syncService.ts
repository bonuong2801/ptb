export class SyncService {
  private channel: BroadcastChannel | null = null;
  private onMessageCallback: ((data: any) => void) | null = null;

  constructor(channelName: string) {
    if (window.electronAPI) {
      window.electronAPI.onSyncReceived((data) => {
        if (this.onMessageCallback) this.onMessageCallback(data);
      });
    } else {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = (event) => {
        if (this.onMessageCallback) this.onMessageCallback(event.data);
      };
    }
  }

  postMessage(data: any) {
    if (window.electronAPI) {
      window.electronAPI.broadcastSync(data);
    } else if (this.channel) {
      this.channel.postMessage(data);
    }
  }

  onMessage(callback: (data: any) => void) {
    this.onMessageCallback = callback;
  }

  close() {
    if (this.channel) {
      this.channel.close();
    }
  }
}
