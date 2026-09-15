import { validate } from 'class-validator';
import {
  CreateKycEvidenceUploadUrlDto,
  SubmitKycDocumentDto,
  SubmitKycSelfieDto,
} from './self-hosted-kyc.dto';

async function errorsFor<T extends object>(value: T) {
  return validate(value);
}

describe('DLKYC request DTOs', () => {
  it('validates the inherited handoff token on every evidence request', async () => {
    const upload = Object.assign(new CreateKycEvidenceUploadUrlDto(), {
      contentType: 'image/jpeg',
    });
    const document = Object.assign(new SubmitKycDocumentDto(), {
      documentType: 'passport',
      frontKey: 'self/u/v/document/front.jpg',
    });
    const selfie = Object.assign(new SubmitKycSelfieDto(), {
      frameKeys: ['self/u/v/selfie/1.jpg', 'self/u/v/selfie/2.jpg'],
      challenge: 'Turn your head slightly to the right',
    });

    for (const dto of [upload, document, selfie]) {
      expect((await errorsFor(dto)).some((error) => error.property === 'token')).toBe(true);
    }
  });

  it('accepts JPEG and rejects formats the evaluator cannot safely decode', async () => {
    const jpeg = Object.assign(new CreateKycEvidenceUploadUrlDto(), {
      token: 'handoff-token',
      contentType: 'image/jpeg',
    });
    const png = Object.assign(new CreateKycEvidenceUploadUrlDto(), {
      token: 'handoff-token',
      contentType: 'image/png',
    });

    expect(await errorsFor(jpeg)).toHaveLength(0);
    expect((await errorsFor(png)).some((error) => error.property === 'contentType')).toBe(true);
  });

  it('bounds selfie evidence to two or three frame keys', async () => {
    const oneFrame = Object.assign(new SubmitKycSelfieDto(), {
      token: 'handoff-token',
      frameKeys: ['self/u/v/selfie/1.jpg'],
      challenge: 'Turn your head slightly to the right',
    });
    const fourFrames = Object.assign(new SubmitKycSelfieDto(), {
      token: 'handoff-token',
      frameKeys: ['1', '2', '3', '4'],
      challenge: 'Turn your head slightly to the right',
    });

    expect((await errorsFor(oneFrame)).some((error) => error.property === 'frameKeys')).toBe(true);
    expect((await errorsFor(fourFrames)).some((error) => error.property === 'frameKeys')).toBe(
      true,
    );
  });
});
