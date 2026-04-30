# Stage 1: Build the Go application
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the application
RUN go build -o server ./cmd/api

# Stage 2: Run the application
FROM alpine:latest

WORKDIR /root/

# Copy the binary from the builder stage
COPY --from=builder /app/server .
# Copy migrations if needed
COPY --from=builder /app/migrations ./migrations

# Expose port
EXPOSE 8888

# Command to run
CMD ["./server"]
