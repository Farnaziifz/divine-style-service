import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, ObjectCannedACL } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

@Injectable()
export class MinioService {
  private s3Client: S3Client;
  private bucketName: string;
  private readonly logger = new Logger(MinioService.name);

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('MINIO_BUCKET_NAME', 'divine-bucket');
    
    this.s3Client = new S3Client({
      endpoint: this.configService.get<string>('MINIO_ENDPOINT', 'http://localhost:9000'),
      region: this.configService.get<string>('MINIO_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string = 'products'): Promise<string> {
    const fileExt = extname(file.originalname);
    const fileName = `${folder}/${uuidv4()}${fileExt}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
          // ACL: ObjectCannedACL.public_read, // Optional: depends on MinIO policy
        }),
      );

      const endpoint = this.configService.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
      // Ensure endpoint doesn't end with slash
      const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
      
      return `${cleanEndpoint}/${this.bucketName}/${fileName}`;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw error;
    }
  }
}
