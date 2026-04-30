package http

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type UploadHandler struct {
	minioClient *minio.Client
	bucketName  string
}

func NewUploadHandler(endpoint, accessKey, secretKey, bucket string) (*UploadHandler, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, err
	}

	// Ensure bucket exists
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		err = client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
		if err != nil {
			return nil, err
		}
		// Set public policy for the bucket so we can see images
		policy := fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Action":["s3:GetObject"],"Effect":"Allow","Principal":"*","Resource":["arn:aws:s3:::%s/*"]}]}`, bucket)
		err = client.SetBucketPolicy(ctx, bucket, policy)
		if err != nil {
			return nil, err
		}
	}

	return &UploadHandler{
		minioClient: client,
		bucketName:  bucket,
	}, nil
}

func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	// Limit upload size (e.g., 5MB)
	r.ParseMultipartForm(5 << 20)

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Generate unique filename
	ext := filepath.Ext(header.Filename)
	fileName := fmt.Sprintf("%s%s", uuid.New().String(), ext)

	// Upload to MinIO
	_, err = h.minioClient.PutObject(context.Background(), h.bucketName, fileName, file, header.Size, minio.PutObjectOptions{
		ContentType: header.Header.Get("Content-Type"),
	})
	if err != nil {
		http.Error(w, "Failed to upload to storage", http.StatusInternalServerError)
		return
	}

	// In a real app, the URL would be served via a CDN or a signed URL
	fileURL := fmt.Sprintf("http://localhost:9000/%s/%s", h.bucketName, fileName)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	fmt.Fprintf(w, `{"url": "%s"}`, fileURL)
}
