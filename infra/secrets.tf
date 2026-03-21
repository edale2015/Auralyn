resource "aws_secretsmanager_secret" "app" {
  name = "${var.project}/${var.environment}/app"
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    DATABASE_URL       = "postgres://REPLACE"
    REDIS_URL          = "redis://REPLACE"
    JWT_SECRET         = "REPLACE"
    SESSION_SECRET     = "REPLACE"
    MD_PASSWORD        = "REPLACE"
    CLINICIAN_PASSWORD = "REPLACE"
    TWILIO_ACCOUNT_SID = "REPLACE"
    TWILIO_AUTH_TOKEN  = "REPLACE"
  })
}

resource "aws_iam_policy" "secrets_read" {
  name = "${var.project}-${var.environment}-secrets-read"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.app.arn]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_secrets_read" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.secrets_read.arn
}
