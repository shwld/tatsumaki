const TEXT: &str = "; charset=utf-8";

/// Port of `artifactContentTypeForPath`. The server decides the Content-Type;
/// the CLI only needs to refuse what the server would answer 415 for.
pub fn content_type_for_path(path: &str) -> Option<String> {
    let file_name = path.rsplit('/').next().unwrap_or(path);
    let dot = file_name.rfind('.')?;
    if dot == 0 {
        return None;
    }
    let extension = file_name[dot + 1..].to_lowercase();
    let text = |mime: &str| Some(format!("{mime}{TEXT}"));
    match extension.as_str() {
        "html" => text("text/html"),
        "css" => text("text/css"),
        "js" | "mjs" => text("text/javascript"),
        "json" => text("application/json"),
        "txt" => text("text/plain"),
        "svg" => Some("image/svg+xml".into()),
        "png" => Some("image/png".into()),
        "jpg" | "jpeg" => Some("image/jpeg".into()),
        "gif" => Some("image/gif".into()),
        "webp" => Some("image/webp".into()),
        "avif" => Some("image/avif".into()),
        "ico" => Some("image/x-icon".into()),
        "woff" => Some("font/woff".into()),
        "woff2" => Some("font/woff2".into()),
        "ttf" => Some("font/ttf".into()),
        "otf" => Some("font/otf".into()),
        "mp3" => Some("audio/mpeg".into()),
        "wav" => Some("audio/wav".into()),
        "ogg" => Some("audio/ogg".into()),
        "mp4" => Some("video/mp4".into()),
        "webm" => Some("video/webm".into()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artifact::read_fixture;

    #[test]
    fn matches_the_shared_content_type_fixture() {
        let fixture = read_fixture("artifact-content-types.json");
        for case in fixture["cases"].as_array().unwrap() {
            let path = case["path"].as_str().unwrap();
            let expected = case["contentType"].as_str().map(str::to_string);
            assert_eq!(content_type_for_path(path), expected, "{path}");
        }
    }
}
