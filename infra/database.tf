resource "aws_db_subnet_group" "db" {
  name       = "${var.project}-${var.environment}-db-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "db" {
  name   = "${var.project}-${var.environment}-db-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
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

resource "aws_db_instance" "postgres" {
  identifier                  = "${var.project}-${var.environment}-postgres"
  engine                      = "postgres"
  engine_version              = "16.3"
  instance_class              = "db.t3.small"
  allocated_storage           = 50
  max_allocated_storage       = 200
  db_name                     = var.db_name
  username                    = var.db_username
  manage_master_user_password = true
  multi_az                    = true
  backup_retention_period     = 7
  skip_final_snapshot         = false
  deletion_protection         = true
  db_subnet_group_name        = aws_db_subnet_group.db.name
  vpc_security_group_ids      = [aws_security_group.db.id]
}
