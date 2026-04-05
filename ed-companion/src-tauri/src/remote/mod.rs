use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use parking_lot::RwLock;
use serde_json::Value;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

use crate::stats::{LifetimeStats, TripStats};

/// Shared state for the remote API
pub struct RemoteState {
    pub current_status: RwLock<Value>,
    pub current_system: RwLock<Value>,
    pub current_route: RwLock<Value>,
    pub trip_stats: RwLock<TripStats>,
    pub lifetime_stats: RwLock<LifetimeStats>,
    pub current_bio: RwLock<Value>,
    pub current_expedition: RwLock<Value>,
    pub overlay_viewmodel: RwLock<Value>,
    pub event_tx: broadcast::Sender<String>,
    pub auth_token: RwLock<Option<String>>,
}

impl RemoteState {
    pub fn new() -> (Arc<Self>, broadcast::Receiver<String>) {
        let (tx, rx) = broadcast::channel(256);
        let state = Arc::new(Self {
            current_status: RwLock::new(Value::Null),
            current_system: RwLock::new(Value::Null),
            current_route: RwLock::new(Value::Null),
            trip_stats: RwLock::new(TripStats::new()),
            lifetime_stats: RwLock::new(LifetimeStats::default()),
            current_bio: RwLock::new(Value::Null),
            current_expedition: RwLock::new(Value::Null),
            overlay_viewmodel: RwLock::new(Value::Null),
            event_tx: tx,
            auth_token: RwLock::new(None),
        });
        (state, rx)
    }

    /// Broadcast an event to all connected WebSocket clients
    pub fn broadcast(&self, event_type: &str, payload: &Value) {
        if self.event_tx.receiver_count() == 0 {
            return;
        }
        let msg = serde_json::json!({
            "type": event_type,
            "payload": payload,
            "ts": chrono::Utc::now().timestamp()
        });
        let _ = self.event_tx.send(msg.to_string());
    }
}

/// Start the remote HTTP/WS server
pub async fn start_server(state: Arc<RemoteState>, port: u16) {
    let app = Router::new()
        .route("/api/status", get(get_status))
        .route("/api/system", get(get_system))
        .route("/api/route", get(get_route))
        .route("/api/trip", get(get_trip))
        .route("/api/stats", get(get_stats))
        .route("/api/bio/current", get(get_bio))
        .route("/api/snapshot", get(get_snapshot))
        .route("/api/trip/reset", post(reset_trip))
        .route("/ws", get(ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    log::info!("Remote server listening on {}", addr);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            log::error!("Remote server failed to bind to {}: {}", addr, e);
            return;
        }
    };
    if let Err(e) = axum::serve(listener, app).await {
        log::error!("Remote server error: {}", e);
    }
}

async fn get_status(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    Json(state.current_status.read().clone())
}

async fn get_system(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    Json(state.current_system.read().clone())
}

async fn get_route(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    Json(state.current_route.read().clone())
}

async fn get_trip(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    let trip = state.trip_stats.read().clone();
    Json(serde_json::to_value(&trip).unwrap_or(Value::Null))
}

async fn get_stats(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    let stats = state.lifetime_stats.read().clone();
    Json(serde_json::to_value(&stats).unwrap_or(Value::Null))
}

async fn get_bio(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    Json(state.current_bio.read().clone())
}

async fn get_snapshot(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    let snapshot = serde_json::json!({
        "status": *state.current_status.read(),
        "system": *state.current_system.read(),
        "route": *state.current_route.read(),
        "bio": *state.current_bio.read(),
        "expedition": *state.current_expedition.read(),
        "trip": serde_json::to_value(&*state.trip_stats.read()).unwrap_or(Value::Null),
    });
    Json(snapshot)
}

async fn reset_trip(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    state.trip_stats.write().reset();
    StatusCode::OK
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<RemoteState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(mut socket: WebSocket, state: Arc<RemoteState>) {
    let mut rx = state.event_tx.subscribe();

    // Send current state as initial snapshot
    let _ = socket
        .send(Message::Text(
            serde_json::json!({
                "type": "snapshot",
                "payload": {
                    "status": *state.current_status.read(),
                    "system": *state.current_system.read(),
                    "route": *state.current_route.read(),
                    "bio": *state.current_bio.read(),
                    "expedition": *state.current_expedition.read(),
                    "trip": serde_json::to_value(&*state.trip_stats.read()).unwrap_or(Value::Null),
                }
            })
            .to_string()
            .into(),
        ))
        .await;

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        log::warn!("WS client lagged {} messages", n);
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}
