import { useEffect, useRef, useState } from "react";

type WebSocketStatus = "connecting" | "open" | "closed" | "error";

export function useWebSocket(path = "/ws") {
  const [status, setStatus] = useState<WebSocketStatus>("closed");
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>();
  const retryDelayRef = useRef(1000);

  useEffect(() => {
    let disposed = false;
    const rawUrl = import.meta.env.VITE_WS_BASE_URL || path;
    const baseUrl = (rawUrl.startsWith("ws") || rawUrl.startsWith("http")
      ? rawUrl
      : `${window.location.origin}${rawUrl}`
    ).replace(/^http/, "ws");

    function connect() {
      if (disposed) return;
      setStatus("connecting");

      const socket = new WebSocket(baseUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        retryDelayRef.current = 1000;
        setStatus("open");
      };

      socket.onerror = () => {
        setStatus("error");
        socket.close();
      };

      socket.onclose = () => {
        if (disposed) return;
        setStatus("closed");
        window.clearTimeout(retryRef.current);
        retryRef.current = window.setTimeout(connect, retryDelayRef.current);
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30000);
      };
    }

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retryRef.current);
      socketRef.current?.close();
    };
  }, [path]);

  return { socket: socketRef.current, status };
}
