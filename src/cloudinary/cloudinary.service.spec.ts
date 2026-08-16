import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService PM Surya Ghar documents', () => {
  const uploadStream = jest.fn();
  const privateDownloadUrl = jest.fn();
  const cloudinary = {
    uploader: { upload_stream: uploadStream },
    utils: { private_download_url: privateDownloadUrl },
  };
  const configService = {
    get: jest.fn().mockReturnValue({
      cloudName: 'test-cloud',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      folder: 'betco/solar-projects',
      cashProofFolder: 'betco/cash-proofs',
      pmSuryaGharDocumentsFolder: 'betco/pm-surya-ghar/documents',
    }),
  };
  const service = new CloudinaryService(
    cloudinary as never,
    configService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads an authenticated raw asset with a PDF extension in its public ID', async () => {
    let receivedOptions: Record<string, unknown> | undefined;
    uploadStream.mockImplementation(
      (
        options: Record<string, unknown>,
        callback: (
          error: Error | undefined,
          result: { public_id: string; bytes: number },
        ) => void,
      ) => {
        receivedOptions = options;
        return {
          end: (buffer: Buffer) =>
            callback(undefined, {
              public_id: `betco/pm-surya-ghar/documents/${String(options.public_id)}`,
              bytes: buffer.length,
            }),
        };
      },
    );

    const upload = await service.uploadPmSuryaGharPdf(Buffer.from('%PDF-'));

    expect(receivedOptions).toMatchObject({
      folder: 'betco/pm-surya-ghar/documents',
      resource_type: 'raw',
      type: 'authenticated',
      overwrite: false,
      use_filename: false,
    });
    const uploadedPublicId = receivedOptions?.public_id;
    expect(typeof uploadedPublicId).toBe('string');
    expect(uploadedPublicId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/,
    );
    expect(upload).toMatchObject({
      format: 'pdf',
      bytes: 5,
    });
    expect(upload.publicId).toMatch(/\.pdf$/);
  });

  it('creates an authenticated raw download URL that expires in five minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
    privateDownloadUrl.mockReturnValue(
      'https://api.cloudinary.com/v1_1/test-cloud/raw/download?signed=true',
    );

    try {
      const result = service.createPmSuryaGharPdfDownload(
        'betco/pm-surya-ghar/documents/document.pdf',
        'pdf',
      );

      expect(privateDownloadUrl).toHaveBeenCalledWith(
        'betco/pm-surya-ghar/documents/document.pdf',
        'pdf',
        {
          resource_type: 'raw',
          type: 'authenticated',
          expires_at: 1_786_881_900,
          attachment: false,
        },
      );
      expect(result.url).toMatch(/^https:\/\//);
      expect(result.expiresAt).toEqual(new Date('2026-08-16T12:05:00.000Z'));
    } finally {
      jest.useRealTimers();
    }
  });
});
