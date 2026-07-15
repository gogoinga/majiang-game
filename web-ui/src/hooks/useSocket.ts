import { io, Socket } from "socket.io-client";
import { computed, ref } from "vue";

let socket: Socket | null = null;
const connected = ref(false);
const id = ref<string | undefined>(undefined);
let listenersBound = false;

function getDefaultSocketUrl() {
  const configuredUrl = import.meta.env.VITE_SOCKET_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  const hostname = window.location.hostname || "localhost";
  return `${protocol}://${hostname}:3000`;
}

export function useSocket() {
  /* —— 连接 —— */
  function connect(url = getDefaultSocketUrl()) {
    if (!socket) {
      socket = io(url, { transports: ["websocket"] });
    }

    if (!listenersBound) {
      socket.on("connect", () => {
        connected.value = true;
        console.log("connect", socket!.id);
        id.value = socket!.id;
      });

      socket.on("disconnect", () => {
        connected.value = false;
        id.value = undefined;
      });

      listenersBound = true;
    }

    connected.value = socket.connected;
    id.value = socket.id;
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
