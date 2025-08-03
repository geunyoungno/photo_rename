import exifr from 'exifr';
import fs from 'fs-extra';
import { DateTime } from 'luxon';

type ResolvedPromise<T> = T extends Promise<infer U> ? U : never;

const dateTimeFormat = 'yyyyLLdd_HHmmss';
const timezone = 'America/New_York';
const desktopPath = '/mnt/c/Users/Awooraji/Desktop';
const photoCategories = {
  foodie: 'Foodie',
  kakao: 'KakaoTalk',
  ipad: '100APPLE',
} as const;


'use strict';

process.stdin.resume();
process.stdin.setEncoding('utf-8');

let inputString: string = '';
let inputLines: string[] = [];
let currentLine: number = 0;

process.stdin.on('data', function(inputStdin: string): void {
    inputString += inputStdin;
});

process.stdin.on('end', function(): void {
    inputLines = inputString.split('\n');
    inputString = '';

    main();
});

function readLine(): string {
    return inputLines[currentLine++];
}



/*
 * Complete the 'fizzBuzz' function below.
 *
 * The function accepts INTEGER n as parameter.
 */

function fizzBuzz(n: number): void {
 Array.from(Array(n).keys()).forEach((index) => {
        const num = index + 1;

        if (num % 3 === 0 && num % 5 === 0) {
        console.log(`FizzBuzz`);
        return;
        }

        if (num % 3 === 0) {
            console.log(`Fizz`);
              return;
        }

        if (num % 5 === 0) {
            console.log(`Buzz`);
              return;
        }

        console.log(`${num}`);
          return;
    })
}

function main() {
    const n: number = parseInt(readLine().trim(), 10);

    fizzBuzz(n);
}


type ta = ResolvedPromise<ReturnType<typeof exifr.parse>>;
type tt = ResolvedPromise<ta>;

type TPhotoCategory = keyof typeof photoCategories;

(async () => {
  console.log('1. 환경변수 PHOTO_CATEGORY 확인');
  const photoCategory = getPhotoCategory(process.env.PHOTO_CATEGORY);

  if (photoCategory === undefined) {
    return;
  }

  console.log('2. 사진들 있는지 확인');

  const photoCategoryPath = photoCategories[photoCategory];

  const path = [desktopPath, photoCategoryPath].join('/');
  const filenames = await readFilenames(path);

  if (filenames.length > 0 === false) {
    console.log('file not found');
    return;
  }

  const filenameMap = new Map<string, number>();

  for (const filenameWithExtension of filenames) {
    // 파일명과 확장자 분리
    const filenameArr = filenameWithExtension.split('.');

    const extenstion = filenameArr.pop();
    const filenameWithoutExtension = filenameArr.join('.');

    const filenameWithoutExtensionArr = filenameWithoutExtension.split('_');
    const isOriginal = filenameWithoutExtensionArr.pop() === 'original';
    const filenameWithoutExtensionAndOriginal = filenameWithoutExtensionArr.join(
      '_'
    );

    // exif 정보 추출
    const exif = await exifr.parse([path, filenameWithExtension].join('/'));
    const { createDate, DateTimeOriginal } = getExifDate(exif);

    // 빈도수에 따른 map 으로 만든다.
    const similarFilenameMap = [
      createDate,
      DateTimeOriginal,
      filenameWithoutExtension,
    ].reduce(
      (accumulator, date) =>
        date === undefined
          ? accumulator
          : accumulator.set(date, (accumulator.get(date) ?? 0) + 1),
      new Map<string, number>()
    );

    const sortedMap = new Map(
      [...similarFilenameMap.entries()].sort((a, b) => b[1] - a[1])
    );

    // filename 가져오기
    const filename: string | undefined = sortedMap.keys().next().value;

    if (filename === undefined) {
      return undefined;
    }

    const filenameCount = filenameMap.get(filename) ?? 0;

    // 변경할 이름
    const changeFilename =
      filenameCount === 0
        ? `${filename}.${extenstion}`
        : `${filename}_${filenameCount + 1}.${extenstion}`;

    console.log('filename 내역', {
      filenameWithExtension,
      changeFilename,
    });

    if (filenameWithExtension === changeFilename) {
      return undefined;
    }
    console.log('filename 변경');
    fs.renameSync(
      [path, filenameWithExtension].join('/'),
      [path, changeFilename].join('/')
    );

    filenameMap.set(filename, filenameCount + 1);
  }
})();

// 모든 경우에 통용되는 것
// async function all() {
//   console.log('1. 환경변수 PHOTO_CATEGORY 확인');
//   const photoCategory = getPhotoCategory(process.env.PHOTO_CATEGORY);

//   if (photoCategory === undefined) {
//     return;
//   }

//   console.log('2. 사진들 있는지 확인');

//   const photoCategoryPath = photoCategories[photoCategory];

//   const path = [desktopPath, photoCategoryPath].join('/');
//   const filenames = await readFilenames(path);

//   if (filenames.length > 0 === false) {
//     console.log('file not found');
//     return;
//   }

//   const filenameMap = new Map<string, number>();

//   for (const filenameWithExtension of filenames) {
//     // 파일명과 확장자 분리
//     const filenameArr = filenameWithExtension.split('.');

//     const extenstion = filenameArr.pop();
//     const filenameWithoutExtension = filenameArr.join('.');

//     // exif 정보 추출
//     const exif = await exifr.parse([path, filenameWithExtension].join('/'));
//     const { createDate, DateTimeOriginal } = getExifDate(exif);

//     // 빈도수에 따른 map 으로 만든다.
//     const similarFilenameMap = [
//       createDate,
//       DateTimeOriginal,
//       filenameWithoutExtension,
//     ].reduce(
//       (accumulator, date) =>
//         date === undefined
//           ? accumulator
//           : accumulator.set(date, (accumulator.get(date) ?? 0) + 1),
//       new Map<string, number>()
//     );

//     const sortedMap = new Map(
//       [...similarFilenameMap.entries()].sort((a, b) => b[1] - a[1])
//     );

//     // filename 가져오기
//     const filename: string | undefined = sortedMap.keys().next().value;

//     if (filename === undefined) {
//       return undefined;
//     }

//     const filenameCount = filenameMap.get(filename) ?? 0;

//     // 변경할 이름
//     const changeFilename =
//       filenameCount === 0
//         ? `${filename}.${extenstion}`
//         : `${filename}_${filenameCount + 1}.${extenstion}`;

//     console.log('filename 내역', {
//       filenameWithExtension,
//       changeFilename,
//     });

//     if (filenameWithExtension === changeFilename) {
//       return undefined;
//     }
//     console.log('filename 변경');
//     fs.renameSync(
//       [path, filenameWithExtension].join('/'),
//       [path, changeFilename].join('/')
//     );

//     filenameMap.set(filename, filenameCount + 1);
//   }
// }

async function readFilenames(path: string) {
  try {
    const filenames = await fs.readdir(path);

    console.log('readFilenames', filenames);

    return filenames;
  } catch (err) {
    console.log('readFilenames err', err);
    return [];
  }
}

function getPhotoCategory(category?: string): TPhotoCategory | undefined {
  if (category === 'foodie' || category === 'kakao' || category === 'ipad') {
    return category;
  }

  return undefined;
}

function getExifDate(exif: ResolvedPromise<ReturnType<typeof exifr.parse>>) {
  const createDate: Date | undefined = exif['CreateDate'];
  const DateTimeOriginal: Date | undefined = exif['DateTimeOriginal'];

  console.log('getExifDate', { createDate, DateTimeOriginal });

  return {
    createDate:
      createDate === undefined
        ? undefined
        : DateTime.fromJSDate(createDate)
            .setZone(timezone)
            .toFormat(dateTimeFormat),
    DateTimeOriginal:
      DateTimeOriginal === undefined
        ? undefined
        : DateTime.fromJSDate(DateTimeOriginal)
            .setZone(timezone)
            .toFormat(dateTimeFormat),
  };
}
