from fastapi import WebSocket


class ConnectionManager:
    """Conexoes de equipe (pedido_id=None) recebem todos os eventos;
    conexoes de cliente recebem apenas os eventos do proprio pedido."""

    def __init__(self) -> None:
        self._connections: dict[WebSocket, int | None] = {}

    def registrar(self, websocket: WebSocket, pedido_id: int | None = None) -> None:
        self._connections[websocket] = pedido_id

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.pop(websocket, None)

    async def broadcast(self, payload: dict) -> None:
        pedido = payload.get("pedido")
        if isinstance(pedido, dict):
            pedido = {chave: valor for chave, valor in pedido.items() if chave != "tokenAcesso"}
            payload = {**payload, "pedido": pedido}
        pedido_id = pedido.get("id") if isinstance(pedido, dict) else None

        disconnected: list[WebSocket] = []
        for websocket, filtro in list(self._connections.items()):
            if filtro is not None and filtro != pedido_id:
                continue
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(websocket)


manager = ConnectionManager()
