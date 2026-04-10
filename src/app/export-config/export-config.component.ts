import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StorageService } from '../storage.service';
import { ImageGcp, GCP, Projection, GcpsUtilsService, exportImgName } from '../gcps-utils.service';
import * as FileSaver from 'file-saver';
import { stringify } from 'querystring';

@Component({
    selector: 'app-export-config',
    templateUrl: './export-config.component.html',
    styleUrls: ['./export-config.component.scss']
})
export class ExportConfigComponent implements OnInit {

    public imageGcps: ImageGcp[];
    public gcps: GCP[];
    public projection: Projection;
    public extras: string[];

    constructor(private router: Router, public storage: StorageService, private utils: GcpsUtilsService) {

        if (typeof storage.imageGcps === 'undefined' ||
            storage.imageGcps === null ||
            storage.imageGcps.length === 0 ||
            typeof storage.projection === 'undefined' ||
            storage.projection === null) {

            router.navigateByUrl('/');
            return;
        }

        this.imageGcps = storage.imageGcps;
        this.gcps = storage.gcps;
        this.projection = storage.projection;
        this.extras = utils.generateExtrasNames(this.imageGcps);
    }

    ngOnInit(): void {
    }

    activate(): void{
        window.dispatchEvent(new CustomEvent('enterLicense'));
    }

    private getTxtContent(): string {
        let content = this.projection.to_str() + '\n';
        // For pipeline files (input had a confidence column), write the 8th
        // 'tagged'/'' status column. For vanilla 7-column input, preserve the
        // upstream format including any trailing extras, with no status column.
        const writeStatus = this.storage.hasPipelineEstimates;
        for (const img of this.imageGcps) {
            const base = `${img.geoX}\t${img.geoY}\t${img.geoZ}\t${img.imX}\t${img.imY}\t${exportImgName(img.imgName)}\t${img.gcpName}`;
            if (writeStatus) {
                const status = img.confirmed ? 'tagged' : '';
                content += `${base}\t${status}`.trimEnd() + '\n';
            } else {
                const extras = (img.extras && img.extras.length) ? '\t' + img.extras.join('\t') : '';
                content += `${base}${extras}`.trimEnd() + '\n';
            }
        }
        return content;
    }

    /** Derive the download filename from the input filename.
     *  {job}.txt → {job}_tagged.txt
     *  {job}_tagged.txt → {job}_tagged.txt  (no double-suffix on round-trip reload)
     *  (no input) → tagged.txt
     */
    private get downloadFileName(): string {
        const input = this.storage.inputFileName;
        if (!input) return 'tagged.txt';
        const stem = input.replace(/\.[^.]+$/, '');
        return stem.endsWith('_tagged') ? input : stem + '_tagged.txt';
    }

    public exportImgName(imgName: string): string {
        return exportImgName(imgName);
    }

    /** Export all rows (tagged + untagged). Tagged rows get col 8 = "tagged"; untagged get "". */
    public exportDownload() {
        if (this.storage.getLicense().demo) {
            window.dispatchEvent(new CustomEvent('enterLicense'));
            return;
        }
        const content = this.getTxtContent();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        FileSaver.saveAs(blob, this.downloadFileName);
    }

    public back() {
        this.router.navigateByUrl('/gcps-map');
    }


}
