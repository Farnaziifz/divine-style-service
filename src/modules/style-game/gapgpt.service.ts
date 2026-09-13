import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MinioService } from '../shared/minio/minio.service';

interface LoadedImage {
  buffer: Buffer;
  mimetype: string;
}

interface StyleFitResult {
  score: number;
  alternativeProductIds: string[];
}

const STYLE_FIT_JSON_SCHEMA_HINT = `فقط و فقط یک JSON خام با این ساختار برگردان، بدون توضیح اضافه و بدون code fence:
{"score": <عدد صحیح بین 0 تا 100>, "alternativeProductIds": [<آیدی۱>, <آیدی۲>]}
اگر score >= 70 بود، alternativeProductIds را آرایه خالی بگذار. اگر score < 70 بود، دقیقاً دو آیدی از لیست کاندیدها که بهتر مناسب فرد در عکس هستند انتخاب کن.`;

@Injectable()
export class GapgptService {
  private readonly logger = new Logger(GapgptService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly minioService: MinioService,
  ) {}

  private getApiKey(): string {
    const key = this.configService.get<string>('GAPGPT_API_KEY');
    if (!key) throw new BadGatewayException('GAPGPT_API_KEY تنظیم نشده است');
    return key;
  }

  private getBaseUrl(): string {
    return (
      this.configService.get<string>('GAPGPT_BASE_URL') ??
      'https://api.gapgpt.app/v1'
    ).replace(/\/+$/, '');
  }

  private getImageModel(): string {
    return this.configService.get<string>('GAPGPT_IMAGE_MODEL') ?? 'gpt-image-1';
  }

  private getVisionModel(): string {
    return this.configService.get<string>('GAPGPT_VISION_MODEL') ?? 'gpt-4o';
  }

  private async loadImage(storedPath: string): Promise<LoadedImage> {
    if (/^https?:\/\//i.test(storedPath)) {
      const res = await fetch(storedPath);
      if (!res.ok) {
        throw new BadGatewayException('دریافت عکس ناموفق بود');
      }
      const arrayBuffer = await res.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        mimetype: res.headers.get('content-type') ?? 'image/jpeg',
      };
    }

    const key = storedPath.replace(/^\/?upload\//, '');
    const { stream, contentType } = await this.minioService.getFileStream(key).catch((err) => {
      this.logger.error(`Failed to load stored image "${storedPath}": ${err.message}`);
      throw new BadGatewayException('دریافت عکس ذخیره‌شده ناموفق بود');
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return { buffer: Buffer.concat(chunks), mimetype: contentType || 'image/jpeg' };
  }

  /** یک عکس ترکیبی تولید می‌کند: فرد در عکس اول با محصول عکس دوم روی خودش (مثلاً گوشواره) */
  async generateStyledImage(personPath: string, productPath: string, productTitle: string): Promise<Buffer> {
    const [person, product] = await Promise.all([
      this.loadImage(personPath),
      this.loadImage(productPath),
    ]);

    const form = new FormData();
    form.append('model', this.getImageModel());
    form.append(
      'prompt',
      `این دو عکس رو ترکیب کن: عکس اول فرد است، عکس دوم محصول «${productTitle}» (یک گوشواره) است. ` +
        `یک عکس واقعی و طبیعی تولید کن که در آن فرد همان گوشواره را به گوش خود کرده باشد. ` +
        `چهره و ظاهر فرد و پس‌زمینهٔ عکس اصلی باید دست‌نخورده و طبیعی بماند، فقط گوشواره به‌صورت واقع‌گرایانه اضافه شود.`,
    );
    form.append(
      'image[]',
      new Blob([new Uint8Array(person.buffer)], { type: person.mimetype }),
      'person.png',
    );
    form.append(
      'image[]',
      new Blob([new Uint8Array(product.buffer)], { type: product.mimetype }),
      'product.png',
    );

    const res = await fetch(`${this.getBaseUrl()}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.getApiKey()}` },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.error(`GapGPT images/edits failed: ${res.status} ${errText}`);
      throw new BadGatewayException('تولید عکس توسط هوش مصنوعی ناموفق بود');
    }

    const json = await res.json();
    const item = json?.data?.[0];
    if (item?.b64_json) {
      return Buffer.from(item.b64_json, 'base64');
    }
    if (item?.url) {
      const imgRes = await fetch(item.url);
      return Buffer.from(await imgRes.arrayBuffer());
    }
    throw new BadGatewayException('پاسخ نامعتبر از سرویس تولید عکس');
  }

  /** عکس تولیدشده رو ارزیابی می‌کنه: امتیاز تناسب + در صورت نیاز دو پیشنهاد جایگزین */
  async evaluateStyleFit(
    generatedImageBuffer: Buffer,
    chosenProduct: { id: string; title: string },
    candidates: { id: string; title: string }[],
  ): Promise<StyleFitResult> {
    const dataUri = `data:image/png;base64,${generatedImageBuffer.toString('base64')}`;
    const candidateList = candidates
      .map((c) => `- id: ${c.id} — ${c.title}`)
      .join('\n');

    const prompt =
      `این عکس، یک فرد را نشان می‌دهد که گوشوارهٔ «${chosenProduct.title}» را زده است. ` +
      `به‌عنوان یک استایلیست حرفه‌ای بگو این گوشواره چقدر با فرم صورت و استایل کلی فرد در عکس تناسب دارد (۰ تا ۱۰۰). ` +
      `لیست کاندیدهای جایگزین (فقط اگر امتیاز کمتر از ۷۰ شد ازشون استفاده کن):\n${candidateList}\n\n` +
      STYLE_FIT_JSON_SCHEMA_HINT;

    const res = await fetch(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.getVisionModel(),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUri } },
            ],
          },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.error(`GapGPT chat/completions failed: ${res.status} ${errText}`);
      throw new BadGatewayException('ارزیابی عکس توسط هوش مصنوعی ناموفق بود');
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const cleaned = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

    let parsed: { score?: number; alternativeProductIds?: string[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error(`Could not parse GapGPT vision response: ${content}`);
      throw new BadGatewayException('پاسخ نامعتبر از سرویس ارزیابی');
    }

    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const alternativeProductIds = Array.isArray(parsed.alternativeProductIds)
      ? parsed.alternativeProductIds.slice(0, 2)
      : [];

    return { score, alternativeProductIds };
  }
}
