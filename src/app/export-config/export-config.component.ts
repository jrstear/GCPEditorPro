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

    private getTxtContent(filter?: (img: ImageGcp) => boolean): string {
        let content = this.projection.to_str() + '\n';
        const rows = filter ? this.imageGcps.filter(filter) : this.imageGcps;
        for (const img of rows) {
            const conf = img.confidence || 'unknown';
            content += `${img.geoX}\t${img.geoY}\t${img.geoZ}\t${img.imX}\t${img.imY}\t${exportImgName(img.imgName)}\t${img.gcpName}\t${conf}\t${img.extras.join('\t')}`.trim() + '\n';
        }
        return content;
    }

    private static readonly CONFIRMED_GREEN = 7;
    private static readonly CONFIRMED_AMBER = 3;

    /** Confirmed image rows (for non-pipeline confirmed download). */
    public get confirmedCount(): number {
        return this.imageGcps.filter(img => img.confirmed).length;
    }

    // --- GCP-* (control) counts ---

    public get gcpControlTotal(): number {
        return this.gcps.filter(g => g.name.startsWith('GCP-')).length;
    }

    /** GCP-* points with ≥CONFIRMED_GREEN confirmed images. */
    public get gcpControlConfirmedCount(): number {
        return this.gcps.filter(g => g.name.startsWith('GCP-') &&
            this.imageGcps.filter(ig => ig.gcpName === g.name && ig.confirmed).length
                >= ExportConfigComponent.CONFIRMED_GREEN
        ).length;
    }

    /** Confirmed image rows for GCP-* points. */
    public get gcpControlImageCount(): number {
        return this.imageGcps.filter(ig => ig.confirmed && ig.gcpName.startsWith('GCP-')).length;
    }

    public get controlBtnClass(): string {
        const n = this.gcpControlConfirmedCount;
        if (n >= ExportConfigComponent.CONFIRMED_GREEN) return 'btn-success';
        if (n >= ExportConfigComponent.CONFIRMED_AMBER) return 'btn-warning';
        return 'btn-danger';
    }

    // --- CHK-* (check) counts ---

    public get gcpCheckTotal(): number {
        return this.gcps.filter(g => g.name.startsWith('CHK-')).length;
    }

    /** CHK-* points with ≥CONFIRMED_GREEN confirmed images. */
    public get gcpCheckConfirmedCount(): number {
        return this.gcps.filter(g => g.name.startsWith('CHK-') &&
            this.imageGcps.filter(ig => ig.gcpName === g.name && ig.confirmed).length
                >= ExportConfigComponent.CONFIRMED_GREEN
        ).length;
    }

    /** Confirmed image rows for CHK-* points. */
    public get gcpCheckImageCount(): number {
        return this.imageGcps.filter(ig => ig.confirmed && ig.gcpName.startsWith('CHK-')).length;
    }

    public get checkBtnClass(): string {
        const n = this.gcpCheckConfirmedCount;
        if (n >= ExportConfigComponent.CONFIRMED_GREEN) return 'btn-success';
        if (n >= ExportConfigComponent.CONFIRMED_AMBER) return 'btn-warning';
        return 'btn-danger';
    }

    public exportImgName(imgName: string): string {
        return exportImgName(imgName);
    }

    public exportTxt() {
        if (this.storage.getLicense().demo) {
            window.dispatchEvent(new CustomEvent('enterLicense'));
            return;
        }
        const content = this.getTxtContent();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        FileSaver.saveAs(blob, 'gcp_list.txt');
    }

    /** Non-pipeline fallback: all confirmed rows in one file. */
    public exportConfirmed() {
        if (this.storage.getLicense().demo) {
            window.dispatchEvent(new CustomEvent('enterLicense'));
            return;
        }
        const content = this.getTxtContent(ig => ig.confirmed);
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        FileSaver.saveAs(blob, 'gcp_confirmed.txt');
    }

    public exportControl() {
        if (this.storage.getLicense().demo) {
            window.dispatchEvent(new CustomEvent('enterLicense'));
            return;
        }
        const content = this.getTxtContent(ig => ig.confirmed && ig.gcpName.startsWith('GCP-'));
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        FileSaver.saveAs(blob, 'gcp_confirmed.txt');
    }

    public exportCheck() {
        if (this.storage.getLicense().demo) {
            window.dispatchEvent(new CustomEvent('enterLicense'));
            return;
        }
        const content = this.getTxtContent(ig => ig.confirmed && ig.gcpName.startsWith('CHK-'));
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        FileSaver.saveAs(blob, 'chk_confirmed.txt');
    }

    public back() {
        this.router.navigateByUrl('/gcps-map');
    }


}
