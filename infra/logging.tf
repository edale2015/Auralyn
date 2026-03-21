resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}/${var.environment}/api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "workers" {
  name              = "/ecs/${var.project}/${var.environment}/workers"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "scheduler" {
  name              = "/ecs/${var.project}/${var.environment}/scheduler"
  retention_in_days = 30
}
