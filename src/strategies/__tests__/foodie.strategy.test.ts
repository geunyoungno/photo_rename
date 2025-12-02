import { getChangedFilename } from '../foodie.strategy';


describe('Foodie Strategy', () => {
  describe('getChangedFilename', () => {
    it('should correctly rename a standard Foodie filename', () => {
      const filename = '2023-10-27-15-30-05-123.jpg';
      const expected = '20231027_153005_123.jpg';
      expect(getChangedFilename(filename)).toBe(expected);
    });

    it('should handle filenames without milliseconds', () => {
      const filename = '2024-01-01-09-00-00.png';
      const expected = '20240101_090000_000.png';
      expect(getChangedFilename(filename)).toBe(expected);
    });

    it('should return null for invalid formats', () => {
      const filename = 'invalid-filename.jpg';
      expect(getChangedFilename(filename)).toBeNull();
    });

    it('should preserve the file extension', () => {
        const filename = '2023-10-27-15-30-05.mov';
        const expected = '20231027_153005_000.mov';
        expect(getChangedFilename(filename)).toBe(expected);
    });
  });
});
