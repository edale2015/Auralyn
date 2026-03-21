resource "aws_backup_vault" "main" {
  name = "${var.project}-${var.environment}-vault"
}

resource "aws_backup_plan" "main" {
  name = "${var.project}-${var.environment}-backup-plan"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 * * ? *)"

    lifecycle {
      delete_after = 30
    }
  }
}

resource "aws_iam_role" "backup" {
  name = "${var.project}-${var.environment}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "backup.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backup_policy" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_selection" "rds" {
  name         = "rds-daily"
  iam_role_arn = aws_iam_role.backup.arn
  plan_id      = aws_backup_plan.main.id

  resources = [aws_db_instance.postgres.arn]
}
