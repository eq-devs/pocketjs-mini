import {openSync,closeSync,writeFileSync,fsyncSync,renameSync,rmSync,fstatSync,constants} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';

export function syncDirectory(path:string):void {
  const directory=openSync(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{fsyncSync(directory);}finally{closeSync(directory);}
}

/** Upgrade persistence of an already authenticated immutable slot, without rewriting it. */
export function syncRegularFile(path:string):void {
  const file=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{if(!fstatSync(file).isFile())throw Error('Host file must be regular');fsyncSync(file);}finally{closeSync(file);}
}

/** Caller holds the host directory lock. Errors after rename may mean committed data. */
export function writeAtomicFile(directoryPath:string,name:string,bytes:string|Uint8Array):void {
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name))throw Error('Invalid host file name');
  const directory=openSync(directoryPath,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  const temporary=join(directoryPath,`.${name}-${randomBytes(12).toString('hex')}`);
  try{
    const file=openSync(temporary,'wx',0o600);
    try{writeFileSync(file,bytes);fsyncSync(file);}finally{closeSync(file);}
    renameSync(temporary,join(directoryPath,name));fsyncSync(directory);
  }finally{try{rmSync(temporary,{force:true});}finally{closeSync(directory);}}
}
