import fs from 'fs-extra';

const foodiePath = '/mnt/c/Users/Awooraji/Desktop/Foodie';

(async () => {
  const filenames = await readFilenames(foodiePath);

  if (filenames.length > 0 === false) {
    return;
  }

  for (const filename of filenames) {
    const changedFilename = getChangedFilename(filename);

    fs.renameSync(
      [foodiePath, filename].join('/'),
      [foodiePath, changedFilename].join('/')
    );
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

function getChangedFilename(filename: string) {
  const filenameArr = filename.split('-');
  const dateFilenameArr = filenameArr.splice(0, 3);
  const millisecondFilenameArr = filenameArr.splice(-1, 1);
  const changedFilename = `${dateFilenameArr.join('')}_${filenameArr.join(
    ''
  )}_${millisecondFilenameArr.join('')}`;

  console.log(changedFilename);

  return changedFilename;
}
