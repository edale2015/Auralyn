output "alb_dns_name" {
  value = aws_lb.api.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "events_queue_url" {
  value = aws_sqs_queue.events.url
}

output "artifacts_bucket_name" {
  value = aws_s3_bucket.artifacts.id
}

output "rds_endpoint" {
  value     = aws_db_instance.postgres.endpoint
  sensitive = true
}

output "redis_primary_endpoint" {
  value     = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive = true
}

output "app_secret_arn" {
  value     = aws_secretsmanager_secret.app.arn
  sensitive = true
}
