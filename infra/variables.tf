variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "medscribe"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "app_port" {
  type    = number
  default = 3000
}

variable "api_cpu" {
  type    = number
  default = 1024
}

variable "api_memory" {
  type    = number
  default = 2048
}

variable "worker_cpu" {
  type    = number
  default = 1024
}

variable "worker_memory" {
  type    = number
  default = 2048
}

variable "scheduler_cpu" {
  type    = number
  default = 512
}

variable "scheduler_memory" {
  type    = number
  default = 1024
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "worker_desired_count" {
  type    = number
  default = 2
}

variable "container_image" {
  type = string
}

variable "certificate_arn" {
  type = string
}

variable "db_name" {
  type    = string
  default = "medscribe"
}

variable "db_username" {
  type    = string
  default = "medscribe_admin"
}
