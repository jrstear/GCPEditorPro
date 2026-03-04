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

    private getTxtContent(confirmedOnly = false): string {

        let content = this.projection.to_str() + '\n';

        const rows = confirmedOnly ? this.imageGcps.filter(img => img.confirmed) : this.imageGcps;
        for (const img of rows) {
            const conf = img.confidence || 'unknown';
            content += `${img.geoX}\t${img.geoY}\t${img.geoZ}\t${img.imX}\t${img.imY}\t${exportImgName(img.imgName)}\t${img.gcpName}\t${conf}\t${img.extras.join('\t')}`.trim() + '\n';
        }

        return content;
    }

    private static readonly TOP_GCP_COUNT = 7;
    private static readonly CONFIRMED_GREEN = 7;
    private static readonly CONFIRMED_AMBER = 3;

    public get confirmedCount(): number {
        return this.imageGcps.filter(img => img.confirmed).length;
    }

    public get top7Total(): number {
        return Math.min(this.gcps.length, ExportConfigComponent.TOP_GCP_COUNT);
    }

    /** Number of top-7 GCPs that have reached the green threshold (≥7 confirmed images). */
    public get top7ConfirmedCount(): number {
        return this.gcps.slice(0, ExportConfigComponent.TOP_GCP_COUNT).filter(gcp => {
            const n = this.imageGcps.filter(ig => ig.gcpName === gcp.name && ig.confirmed).length;
            return n >= ExportConfigComponent.CONFIRMED_GREEN;
        }).length;
    }

    /** Bootstrap button class for the Download gcp_confirmed.txt button — matches the GCP list summary colour. */
    public get confirmedBtnClass(): string {
        if (!this.storage.hasPipelineEstimates) return 'btn-success';
        const n = this.top7ConfirmedCount;
        if (n >= ExportConfigComponent.CONFIRMED_GREEN) return 'btn-success';
        if (n >= ExportConfigComponent.CONFIRMED_AMBER) return 'btn-warning';
        return 'btn-danger';
    }

    public exportImgName(imgName: string): string{
        return exportImgName(imgName);
    }

    public exportTxt() {
        if (this.storage.getLicense().demo){
            window.dispatchEvent(new CustomEvent('enterLicense'));
            return;
        }

        const content = this.getTxtContent();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        FileSaver.saveAs(blob, 'gcp_list.txt');
    }

    public exportConfirmed() {
        if (this.storage.getLicense().demo) {
            window.dispatchEvent(new CustomEvent('enterLicense'));
            return;
        }

        const content = this.getTxtContent(true);
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        FileSaver.saveAs(blob, 'gcp_confirmed.txt');
    }

    public back() {
        this.router.navigateByUrl('/gcps-map');
    }


}
