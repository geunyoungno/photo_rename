import fs from 'fs-extra';
import * as ExifReader from 'exifreader';
import { DateTime } from 'luxon';
import path from 'path'

const filePath = '/mnt/c/Users/Awooraji/Desktop/Kakao';

const filenameMap: Map<string, number> = new Map();

(async () => {
  const filenames = await readFilenames(filePath);

  if (filenames.length > 0 === false) {
    return;
  }

  for await (const filename of filenames) {
    try {
        const changedFilenameOrigin = await getChangedFilename(filename);

        if (changedFilenameOrigin === undefined) {
            throw new Error('file name error')
        }
    
        // console.log('rename',{filename, changedFilename});

        let changedFilename;
        if (filenameMap.has(changedFilenameOrigin)) {
             changedFilename = [changedFilenameOrigin, (filenameMap.get(changedFilenameOrigin)  ?? 0)].join('_')
            console.log('filenameMap has', changedFilename);
        } else {
             changedFilename = changedFilenameOrigin;
        }

        filenameMap.set(changedFilenameOrigin, (filenameMap.get(changedFilenameOrigin)  ?? 0) + 1)

        const ext = path.extname(filename);

   
           fs.renameSync(
      [filePath, filename].join('/'),
     `${ [filePath, changedFilename].join('/')}${ext}`
    );
    } catch(err) {
        console.error('file name error' , {filename})
    }

 
  }
})();

/** 파밀들 읽어오기 */
async function readFilenames(path: string) {
  try {
    const filenames = await fs.readdir(path);
    

    // console.log('readFilenames', filenames);

    return filenames;
  } catch (err) {
    console.log('readFilenames err', err);
    return [];
  }
}

async function getDateTime(filename: string) {
  const file = fs.readFileSync([filePath,filename].join('/'));

  const tags = await ExifReader.load(file);
  const dateTimeOriginal = tags['DateTimeOriginal']?.description;

  if (dateTimeOriginal != null) {
      return dateTimeOriginal;
  }

  const stats = fs.statSync([filePath,filename].join('/'));

  const modifiedTime = stats['mtime'];

  if (modifiedTime != null) {
    return DateTime.fromJSDate(modifiedTime).toFormat('yyyy:LL:dd HH:mm:ss')
  }

  return undefined;
}



async function getChangedFilename(filename: string) {
    // const filenameArr = filename.split('-');
    // const dateFilenameArr = filenameArr.splice(0, 3);
    // const millisecondFilenameArr = filenameArr.splice(-1, 1);
    // const changedFilename = `${dateFilenameArr.join('')}_${filenameArr.join(
    //   ''
    // )}_${millisecondFilenameArr.join('')}`;

    const dateTime = await getDateTime(filename);

    if (dateTime == null) {
      return undefined;
    }

    const changedFilename = DateTime.fromFormat(dateTime, 'yyyy:LL:dd HH:mm:ss').toFormat('yyyyLLdd_HHmmss');

    return changedFilename;
  }
  
