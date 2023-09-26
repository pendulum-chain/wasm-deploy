import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const folders = ['deploy', 'test', '.'];
export const distDir = 'dist';

export function compileInPlace(baseProjectDir: string): void {

    execSync(`npm run build`, { cwd: process.cwd(), stdio: 'inherit' });

    //Move the compiled files to the project dir
    for (const dir of folders) {

        moveCompiledFiles(path.join(distDir, dir), path.join(`./${baseProjectDir}`, dir));


    }

    fs.rmdirSync(distDir, { recursive: true });
}


function moveCompiledFiles(fromDir: string, toDir: string) {
    if (fs.existsSync(fromDir)) {
        const files = fs.readdirSync(fromDir);

        for (const file of files) {

            if (path.extname(file) === '.js') {
                const from = path.join(fromDir, file);
                const to = path.join(toDir, file);
                fs.renameSync(from, to);
            }
        }
    }

}






