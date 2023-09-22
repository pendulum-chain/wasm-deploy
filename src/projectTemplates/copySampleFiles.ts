import * as fs from 'fs';
import * as path from 'path';


function recursiveCopy(srcDir: string, destDir: string): void {

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }


    for (const item of fs.readdirSync(srcDir)) {
        const srcItem = path.join(srcDir, item);
        const destItem = path.join(destDir, item);

        const stat = fs.statSync(srcItem);

        if (stat.isDirectory()) {

            recursiveCopy(srcItem, destItem);
        } else {

            fs.copyFileSync(srcItem, destItem);
        }
    }
}

const sourceDir = path.resolve(__dirname, '../../src/projectTemplates/rawFiles');
const targetDir = path.resolve(__dirname, '../../dist/projectTemplates/rawFiles');

recursiveCopy(sourceDir, targetDir);