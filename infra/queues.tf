resource "aws_sqs_queue" "events" {
  name                       = "${var.project}-${var.environment}-events"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600
}

resource "aws_sqs_queue" "events_dlq" {
  name = "${var.project}-${var.environment}-events-dlq"
}

resource "aws_sqs_queue_redrive_policy" "events" {
  queue_url = aws_sqs_queue.events.id
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.events_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_iam_policy" "sqs_publish" {
  name = "${var.project}-${var.environment}-sqs-publish"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage", "sqs:GetQueueUrl"]
      Resource = [aws_sqs_queue.events.arn]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_sqs_publish" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.sqs_publish.arn
}
