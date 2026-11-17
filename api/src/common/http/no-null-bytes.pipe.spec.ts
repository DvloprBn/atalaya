import { BadRequestException } from '@nestjs/common';
import { NoNullBytesPipe } from './no-null-bytes.pipe.js';

describe('NoNullBytesPipe', () => {
  const pipe = new NoNullBytesPipe();

  it('deja pasar datos normales', () => {
    const body = { email: 'ana@example.com', list: ['a', { b: 'c' }] };
    expect(pipe.transform(body)).toBe(body);
  });

  it('rechaza el byte nulo en cualquier nivel, también en las llaves', () => {
    expect(() => pipe.transform('a\u0000b')).toThrow(BadRequestException);
    expect(() => pipe.transform({ a: [{ b: 'x\u0000' }] })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ['k\u0000']: 1 })).toThrow(BadRequestException);
  });
});
