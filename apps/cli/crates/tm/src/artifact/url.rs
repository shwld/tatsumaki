/// Builds the part of a URL path that follows `/files/`: every segment of the
/// canonical path is percent-encoded and the `/` separators are kept. The
/// server percent-decodes the raw pathname exactly once.
pub fn encode_file_path(canonical_path: &str) -> String {
    canonical_path
        .split('/')
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_each_segment_and_keeps_separators() {
        let cases = [
            ("index.html", "index.html"),
            ("assets/app.js", "assets/app.js"),
            ("100%.txt", "100%25.txt"),
            ("a%2Fb.txt", "a%252Fb.txt"),
            (
                "日本語/ファイル.txt",
                "%E6%97%A5%E6%9C%AC%E8%AA%9E/%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB.txt",
            ),
            ("a b/c.txt", "a%20b/c.txt"),
            ("a#b.txt", "a%23b.txt"),
            ("a?b.txt", "a%3Fb.txt"),
            ("a+b.txt", "a%2Bb.txt"),
        ];
        for (input, expected) in cases {
            assert_eq!(encode_file_path(input), expected, "{input}");
        }
    }
}
