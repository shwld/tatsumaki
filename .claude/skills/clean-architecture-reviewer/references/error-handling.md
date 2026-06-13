# エラーハンドリング

- 期待可能な業務エラーはユースケース層に限らず、route/usecase/repository などのモジュール境界で `neverthrow` の `Result` で表現し、例外依存を避ける。
