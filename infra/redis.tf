resource "aws_security_group" "redis" {
  name   = "${var.project}-${var.environment}-redis-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project}-${var.environment}-redis-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.project}-${var.environment}-redis"
  description                = "Redis for queues and cache"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t3.small"
  automatic_failover_enabled = true
  multi_az_enabled           = true
  num_cache_clusters         = 2
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
}
