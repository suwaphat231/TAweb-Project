// Package filestore keeps uploaded files (grade sheets, REG cards, grade
// proofs, class schedules, report evidence) in S3-compatible object storage
// — MinIO in docker-compose — instead of as blobs in MySQL.
//
// A row points at its file by key. Rows written before object storage was
// turned on still hold the bytes in their blob column; Load reads either, and
// MigrateBlobs (see the database package) moves the old blobs over. With no
// endpoint configured the store is off and files stay in MySQL as before, so
// tests and a bare local run need nothing extra.
package filestore

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Config is where the files go. An empty Endpoint turns the store off.
type Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

const opTimeout = 60 * time.Second

var (
	client *minio.Client
	bucket string
)

// Init connects to the object store and makes sure the bucket exists. MinIO
// can come up after the backend, so it retries for a while first.
func Init(cfg Config) error {
	if cfg.Endpoint == "" {
		log.Println("[filestore] S3_ENDPOINT not set: uploaded files stay in MySQL")
		return nil
	}
	c, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return fmt.Errorf("object storage client: %w", err)
	}

	const attempts = 15
	for i := 1; ; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = ensureBucket(ctx, c, cfg.Bucket)
		cancel()
		if err == nil {
			break
		}
		if i == attempts {
			return fmt.Errorf("object storage bucket %q: %w", cfg.Bucket, err)
		}
		log.Printf("[filestore] object storage not ready (attempt %d/%d): %v", i, attempts, err)
		time.Sleep(2 * time.Second)
	}
	client, bucket = c, cfg.Bucket
	log.Printf("[filestore] storing uploaded files in bucket %q at %s", cfg.Bucket, cfg.Endpoint)
	return nil
}

func ensureBucket(ctx context.Context, c *minio.Client, name string) error {
	exists, err := c.BucketExists(ctx, name)
	if err != nil || exists {
		return err
	}
	// New buckets are private: files are only ever served through the API,
	// which checks who is asking.
	return c.MakeBucket(ctx, name, minio.MakeBucketOptions{})
}

// Enabled reports whether files go to object storage.
func Enabled() bool { return client != nil }

// Save stores one uploaded file. With object storage on it returns the new
// key and a nil blob; with it off, an empty key and the data to keep in the
// blob column. Either way the caller writes both onto the row.
func Save(prefix string, data []byte, contentType string) (key string, blob []byte, err error) {
	if client == nil {
		return "", data, nil
	}
	key, err = newKey(prefix)
	if err != nil {
		return "", nil, err
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()
	if _, err := client.PutObject(ctx, bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType}); err != nil {
		return "", nil, fmt.Errorf("store file: %w", err)
	}
	return key, nil, nil
}

// Load returns a row's file: from object storage when it has a key, else the
// bytes still held in its blob column.
func Load(key string, blob []byte) ([]byte, error) {
	if key == "" {
		return blob, nil
	}
	if client == nil {
		return nil, errors.New("file is in object storage but S3_ENDPOINT is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()
	obj, err := client.GetObject(ctx, bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("load file: %w", err)
	}
	defer obj.Close()
	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, fmt.Errorf("load file %s: %w", key, err)
	}
	return data, nil
}

// Remove deletes a file no row points at any more. Failure only leaves an
// orphan object behind, so it is logged, not returned.
func Remove(key string) {
	if key == "" || client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()
	if err := client.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{}); err != nil {
		log.Printf("[filestore] remove %s: %v", key, err)
	}
}

// newKey is prefix/yyyy/mm/<random>, so keys never collide and old uploads
// are easy to find by date.
func newKey(prefix string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s/%s/%s", prefix, time.Now().UTC().Format("2006/01"), hex.EncodeToString(b)), nil
}
