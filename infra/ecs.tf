resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}-cluster"
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project}-${var.environment}-ecs-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_exec_basic" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_lb" "api" {
  name               = "${var.project}-${var.environment}-alb"
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project}-${var.environment}-tg"
  port        = var.app_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path                = "/health/readyz"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 20
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.api_cpu)
  memory                   = tostring(var.api_memory)
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = var.container_image
    essential = true
    command   = ["node", "dist/index.cjs"]
    portMappings = [{
      containerPort = var.app_port
      hostPort      = var.app_port
      protocol      = "tcp"
    }]
    environment = [
      { name = "NODE_ENV", value = var.environment },
      { name = "PORT", value = tostring(var.app_port) },
      { name = "AWS_APP_SECRET_ID", value = "${var.project}/${var.environment}/app" },
      { name = "AWS_EVENTS_QUEUE_URL", value = aws_sqs_queue.events.url },
      { name = "AWS_ARTIFACTS_BUCKET", value = aws_s3_bucket.artifacts.id }
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
      { name = "REDIS_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:REDIS_URL::" },
      { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:JWT_SECRET::" },
      { name = "SESSION_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:SESSION_SECRET::" },
      { name = "MD_PASSWORD", valueFrom = "${aws_secretsmanager_secret.app.arn}:MD_PASSWORD::" },
      { name = "CLINICIAN_PASSWORD", valueFrom = "${aws_secretsmanager_secret.app.arn}:CLINICIAN_PASSWORD::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-region        = var.aws_region
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "workers" {
  family                   = "${var.project}-${var.environment}-workers"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.worker_cpu)
  memory                   = tostring(var.worker_memory)
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name      = "workers"
    image     = var.container_image
    essential = true
    command   = ["node", "dist/workers/index.cjs"]
    environment = [
      { name = "NODE_ENV", value = var.environment },
      { name = "AWS_APP_SECRET_ID", value = "${var.project}/${var.environment}/app" }
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
      { name = "REDIS_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:REDIS_URL::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-region        = var.aws_region
        awslogs-group         = aws_cloudwatch_log_group.workers.name
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "scheduler" {
  family                   = "${var.project}-${var.environment}-scheduler"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.scheduler_cpu)
  memory                   = tostring(var.scheduler_memory)
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name      = "scheduler"
    image     = var.container_image
    essential = true
    command   = ["node", "dist/scheduler/index.cjs"]
    environment = [
      { name = "NODE_ENV", value = var.environment },
      { name = "AWS_APP_SECRET_ID", value = "${var.project}/${var.environment}/app" }
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
      { name = "REDIS_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:REDIS_URL::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-region        = var.aws_region
        awslogs-group         = aws_cloudwatch_log_group.scheduler.name
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "${var.project}-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.app_port
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "workers" {
  name            = "${var.project}-${var.environment}-workers"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.workers.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs.id]
  }
}

resource "aws_ecs_service" "scheduler" {
  name            = "${var.project}-${var.environment}-scheduler"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.scheduler.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs.id]
  }
}
