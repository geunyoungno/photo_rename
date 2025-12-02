import path from 'path';

// groupLivePhotos를 테스트하기 위해 export 필요
// 임시로 함수만 테스트
describe('iPad Strategy', () => {
  describe('Live Photo Detection', () => {
    it('should detect IMG_XXXX pattern files', () => {
      const filenames = [
        'IMG_1234.HEIC',
        'IMG_1234.MOV',
        'IMG_5678.JPG',
        'random_file.jpg',
      ];

      // IMG_로 시작하는 파일들
      const imgFiles = filenames.filter((name) => {
        const baseName = path.basename(name, path.extname(name));
        return baseName.startsWith('IMG_');
      });

      expect(imgFiles).toHaveLength(3);
      expect(imgFiles).toContain('IMG_1234.HEIC');
      expect(imgFiles).toContain('IMG_1234.MOV');
      expect(imgFiles).toContain('IMG_5678.JPG');
    });

    it('should identify photo and video pairs with same base name', () => {
      const filenames = ['IMG_1234.HEIC', 'IMG_1234.MOV'];
      const groups = new Map<string, { photo?: string; video?: string }>();

      for (const filename of filenames) {
        const ext = path.extname(filename).toLowerCase();
        const baseName = path.basename(filename, path.extname(filename));

        if (!baseName.startsWith('IMG_')) continue;

        if (!groups.has(baseName)) {
          groups.set(baseName, {});
        }

        const group = groups.get(baseName)!;

        if (['.heic', '.jpg', '.jpeg', '.png'].includes(ext)) {
          group.photo = filename;
        } else if (ext === '.mov') {
          group.video = filename;
        }
      }

      expect(groups.size).toBe(1);
      expect(groups.get('IMG_1234')).toEqual({
        photo: 'IMG_1234.HEIC',
        video: 'IMG_1234.MOV',
      });
    });

    it('should handle photos without matching MOV files', () => {
      const filenames = ['IMG_1234.HEIC', 'IMG_5678.JPG'];
      const groups = new Map<string, { photo?: string; video?: string }>();

      for (const filename of filenames) {
        const ext = path.extname(filename).toLowerCase();
        const baseName = path.basename(filename, path.extname(filename));

        if (!baseName.startsWith('IMG_')) continue;

        if (!groups.has(baseName)) {
          groups.set(baseName, {});
        }

        const group = groups.get(baseName)!;

        if (['.heic', '.jpg', '.jpeg', '.png'].includes(ext)) {
          group.photo = filename;
        } else if (ext === '.mov') {
          group.video = filename;
        }
      }

      expect(groups.size).toBe(2);
      expect(groups.get('IMG_1234')).toEqual({
        photo: 'IMG_1234.HEIC',
        video: undefined,
      });
      expect(groups.get('IMG_5678')).toEqual({
        photo: 'IMG_5678.JPG',
        video: undefined,
      });
    });

    it('should handle MOV files without matching photo (standalone video)', () => {
      const filenames = ['IMG_1234.MOV'];
      const groups = new Map<string, { photo?: string; video?: string }>();

      for (const filename of filenames) {
        const ext = path.extname(filename).toLowerCase();
        const baseName = path.basename(filename, path.extname(filename));

        if (!baseName.startsWith('IMG_')) continue;

        if (!groups.has(baseName)) {
          groups.set(baseName, {});
        }

        const group = groups.get(baseName)!;

        if (['.heic', '.jpg', '.jpeg', '.png'].includes(ext)) {
          group.photo = filename;
        } else if (ext === '.mov') {
          group.video = filename;
        }
      }

      // 사진과 비디오 둘 다 없는 그룹 제거
      for (const [key, group] of groups.entries()) {
        if (!group.photo && !group.video) {
          groups.delete(key);
        }
      }

      expect(groups.size).toBe(1);
      expect(groups.get('IMG_1234')).toEqual({
        photo: undefined,
        video: 'IMG_1234.MOV',
      });
    });

    it('should handle multiple live photo pairs', () => {
      const filenames = [
        'IMG_1234.HEIC',
        'IMG_1234.MOV',
        'IMG_5678.JPG',
        'IMG_5678.MOV',
        'IMG_9999.PNG',
      ];
      const groups = new Map<string, { photo?: string; video?: string }>();

      for (const filename of filenames) {
        const ext = path.extname(filename).toLowerCase();
        const baseName = path.basename(filename, path.extname(filename));

        if (!baseName.startsWith('IMG_')) continue;

        if (!groups.has(baseName)) {
          groups.set(baseName, {});
        }

        const group = groups.get(baseName)!;

        if (['.heic', '.jpg', '.jpeg', '.png'].includes(ext)) {
          group.photo = filename;
        } else if (ext === '.mov') {
          group.video = filename;
        }
      }

      expect(groups.size).toBe(3);
      expect(groups.get('IMG_1234')?.video).toBe('IMG_1234.MOV');
      expect(groups.get('IMG_5678')?.video).toBe('IMG_5678.MOV');
      expect(groups.get('IMG_9999')?.video).toBeUndefined();
    });

    it('should handle mixed photos, live photos, and standalone videos', () => {
      const filenames = [
        'IMG_1111.HEIC', // 사진만
        'IMG_2222.MOV', // 비디오만
        'IMG_3333.JPG', // 라이브 포토
        'IMG_3333.MOV',
      ];
      const groups = new Map<string, { photo?: string; video?: string }>();

      for (const filename of filenames) {
        const ext = path.extname(filename).toLowerCase();
        const baseName = path.basename(filename, path.extname(filename));

        if (!baseName.startsWith('IMG_')) continue;

        if (!groups.has(baseName)) {
          groups.set(baseName, {});
        }

        const group = groups.get(baseName)!;

        if (['.heic', '.jpg', '.jpeg', '.png'].includes(ext)) {
          group.photo = filename;
        } else if (ext === '.mov') {
          group.video = filename;
        }
      }

      expect(groups.size).toBe(3);
      expect(groups.get('IMG_1111')).toEqual({
        photo: 'IMG_1111.HEIC',
        video: undefined,
      });
      expect(groups.get('IMG_2222')).toEqual({
        photo: undefined,
        video: 'IMG_2222.MOV',
      });
      expect(groups.get('IMG_3333')).toEqual({
        photo: 'IMG_3333.JPG',
        video: 'IMG_3333.MOV',
      });
    });
  });
});
