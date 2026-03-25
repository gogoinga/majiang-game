import { io, Socket } from "socket.io-client";
import { computed, ref } from "vue";

let socket: Socket | null = null;

export function useSocket() {
  /* —— 响应式状态 —— */
  const connected = ref(false);
  const id = ref<string | undefined>(undefined);

  /* —— 连接 —— */
  function connect(url = "http://localhost:3000") {
    if (socket) return; // 防止重复连接
    socket = io(url, { transports: ["websocket"] });

    socket.on("connect", () => {
      connected.value = true;
      console.log("connect", socket!.id);
      id.value = socket!.id;
    });

    socket.on("disconnect", () => {
      connected.value = false;
      id.value = undefined;
    });
  }

  /* —— 工具函数 —— */
  const send = (event: string, payload?: any) => socket?.emit(event, payload);
  const on = (event: string, fn: (...args: any[]) => void) =>
    socket?.on(event, fn);
  const off = (event: string, fn?: (...args: any[]) => void) =>
    socket?.off(event, fn);

  const playCard = (card: string) => {
    send("playCard", { card });
  };

  /* —— 快捷属性 —— */
  const socketId = computed(() => id.value);

  return { connected, socketId, connect, send, on, off, playCard };
}
