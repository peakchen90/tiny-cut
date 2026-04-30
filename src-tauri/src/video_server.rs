use axum::{
    body::Body,
    extract::Query,
    http::{
        header::{self, HeaderValue},
        HeaderMap, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tower_http::cors::CorsLayer;

#[derive(Deserialize)]
struct VideoQuery {
    path: String,
}

pub async fn start() -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Failed to bind video server");
    let port = listener.local_addr().unwrap().port();

    let app = Router::new()
        .route("/video", get(serve_video))
        .layer(CorsLayer::permissive());

    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    port
}

async fn serve_video(Query(query): Query<VideoQuery>, headers: HeaderMap) -> Response {
    let path = query.path;

    let metadata = match tokio::fs::metadata(&path).await {
        Ok(m) => m,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let file_size = metadata.len();

    // Handle range request
    if let Some(range_header) = headers.get(header::RANGE) {
        if let Some((start, end)) = parse_range(range_header.to_str().unwrap_or(""), file_size) {
            let mut file = match File::open(&path).await {
                Ok(f) => f,
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };

            let length = end - start + 1;
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }

            let stream = async_stream::stream! {
                let mut remaining = length;
                let mut buf = vec![0u8; 64 * 1024];
                while remaining > 0 {
                    let to_read = remaining.min(buf.len() as u64) as usize;
                    match file.read(&mut buf[..to_read]).await {
                        Ok(0) => break,
                        Ok(n) => {
                            remaining -= n as u64;
                            yield Ok::<_, std::io::Error>(buf[..n].to_vec());
                        }
                        Err(e) => {
                            yield Err(e);
                            break;
                        }
                    }
                }
            };

            return Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, "video/mp4")
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {}-{}/{}", start, end, file_size),
                )
                .header(header::CONTENT_LENGTH, length)
                .header(header::ACCEPT_RANGES, "bytes")
                .body(Body::from_stream(stream))
                .unwrap()
                .into_response();
        }
    }

    // Full file request — stream it
    let mut file = match File::open(&path).await {
        Ok(f) => f,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    let stream = async_stream::stream! {
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            match file.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => yield Ok::<_, std::io::Error>(buf[..n].to_vec()),
                Err(e) => {
                    yield Err(e);
                    break;
                }
            }
        }
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::CONTENT_LENGTH, file_size)
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from_stream(stream))
        .unwrap()
        .into_response()
}

fn parse_range(range: &str, file_size: u64) -> Option<(u64, u64)> {
    let range = range.strip_prefix("bytes=")?;
    let parts: Vec<&str> = range.split('-').collect();
    if parts.len() != 2 {
        return None;
    }

    let start: u64 = parts[0].parse().ok()?;
    let end: u64 = if parts[1].is_empty() {
        file_size - 1
    } else {
        parts[1].parse().ok()?
    };

    Some((start, end.min(file_size - 1)))
}
