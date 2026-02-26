import { Component, OnInit, Output, EventEmitter, Input, ViewChild, ElementRef, AfterViewInit, HostListener, ChangeDetectorRef } from '@angular/core';
import * as Panzoom from '@panzoom/panzoom';
import { fromEvent, timer, TimeoutError } from 'rxjs';
import { CoordsXY } from '../../shared/common';

@Component({
    selector: 'app-smartimage',
    templateUrl: './smartimage.component.html',
    styleUrls: ['./smartimage.component.scss']
})
export class SmartimageComponent implements OnInit, AfterViewInit {
    showMessage: boolean;

    constructor(private el: ElementRef) { }

    @Input()
    get pinLocation() {
        return this.pinLocationValue;
    }

    set pinLocation(val) {
        this.pinLocationValue = val;
        this.syncPinPosition();
        this.pinLocationChange.emit(this.pinLocationValue);
    }

    @Output() public pin = new EventEmitter();
    @Input() public src: string;
    /** Pin color: 'yellow' (unconfirmed estimate) or 'green' (user-confirmed). */
    @Input() public pinColor: string = 'yellow';
    /** When true, zoom/pan the image to fit its container on each load. Use in fixed-size panels. */
    @Input() public autoFit: boolean = false;
    @ViewChild('img') img: ElementRef;
    @ViewChild('pin') pinDiv: ElementRef;
    @ViewChild('msg') msgDiv: ElementRef;

    pinLocationValue: CoordsXY = null;
    onSmartImagesLayoutChanged = null;

    private panzoom: Panzoom.PanzoomObject = null;

    @Output()
    pinLocationChange = new EventEmitter<CoordsXY>();

    private wheelMessageTimeout: any;

    @HostListener('window:resize', ['$event'])
    onResize(event) {
        if (this.autoFit) this._fitToContainer();
        this.syncPinPosition();
    }

    ngAfterViewInit(): void {
        this.panzoom = Panzoom.default(this.img.nativeElement, {
            maxScale: 300,
            cursor: 'default',
            animate: false,
            canvas: true,
            step: 0.7,
            overflow: "visible"
        });

        const click = fromEvent(this.img.nativeElement, 'click');

        let start = Date.now();

        let timeout: any = null;

        const panzoomchange = fromEvent(this.img.nativeElement, 'panzoomchange');

        panzoomchange.subscribe((e: CustomEvent) => {

            if (this.pinLocation != null) {

                this.pinDiv.nativeElement.style.display = 'none';

                if (timeout !== null) {
                    clearTimeout(timeout);
                    timeout = null;
                }

                timeout = setTimeout(() => {
                    this.syncPinPosition();
                    this.pinDiv.nativeElement.style.display = 'block';
                }, 250);
            }

            start = Date.now();

        });

        click.subscribe((e: MouseEvent) => {

            const millis = Date.now() - start;

            start = Date.now();

            if (millis > 250) {

                this.pinLocation = this.getPos(e);

                const rect = this.img.nativeElement.parentElement.getClientRects()[0];

                this.pinDiv.nativeElement.style.left = (e.clientX - rect.left - this.pinDiv.nativeElement.width / 2) + 'px';
                this.pinDiv.nativeElement.style.top = (e.clientY - rect.top - this.pinDiv.nativeElement.height / 2) + 'px';

                this.pin.emit(this.pinLocation);

            }
        });

        // this.img.nativeElement.parentElement.addEventListener('wheel', this.panzoom.zoomWithWheel);
        this.img.nativeElement.parentElement.addEventListener('wheel', (e: WheelEvent) => {
            if (!e.shiftKey) {
                this.displayWheelMessage();

                return;
            }
            // When a pin is set, zoom around the GCP screen position so it stays fixed.
            // Use zoomToPoint() which takes { clientX, clientY } viewport coordinates.
            if (this.pinLocationValue !== null) {
                const pinScreen = this.getPinLocation();
                if (pinScreen) {
                    const parentRect = this.img.nativeElement.parentElement.getClientRects()[0];
                    // On Mac with shift, deltaY becomes 0 and deltaX carries the scroll.
                    const delta = e.deltaY === 0 && e.deltaX ? e.deltaX : e.deltaY;
                    const wheel = delta < 0 ? 1 : -1;
                    const toScale = Math.min(300, Math.max(0.125, this.panzoom.getScale() * Math.exp((wheel * 0.7) / 3)));
                    this.panzoom.zoomToPoint(toScale, {
                        clientX: parentRect.left + pinScreen.x,
                        clientY: parentRect.top + pinScreen.y
                    });
                    e.preventDefault();
                    return;
                }
            }
            // Panzoom will automatically use `deltaX` here instead
            // of `deltaY`. On a mac, the shift modifier usually
            // translates to horizontal scrolling, but Panzoom assumes
            // the desired behavior is zooming.
            this.panzoom.zoomWithWheel(e);
        });
        this.img.nativeElement.parentElement.addEventListener('mouseleave', () => {
            this.msgDiv.nativeElement.style.opacity = 0;
        })

        // Fit image to container on every load (handles src changes + initial load)
        const onLoad = () => {
            if (this.autoFit) this._fitToContainer();
            this.syncPinPosition();
        };
        this.img.nativeElement.addEventListener('load', onLoad);
        // Handle already-loaded (cached) images
        if (this.img.nativeElement.complete && this.img.nativeElement.naturalWidth > 0) {
            setTimeout(() => onLoad(), 0);
        }

        this.onSmartImagesLayoutChanged = () => {
            setTimeout(() => {
                if (this.autoFit) this._fitToContainer();
                this.syncPinPosition();
            }, 250);
        };
        window.addEventListener("smartImagesLayoutChanged", this.onSmartImagesLayoutChanged);
    }

    ngOnDestroy() {
        if (this.onSmartImagesLayoutChanged) window.removeEventListener("smartImagesLayoutChanged", this.onSmartImagesLayoutChanged);
    }

    private displayWheelMessage() {
        clearTimeout(this.wheelMessageTimeout);
        this.msgDiv.nativeElement.style.opacity = 1;
        this.wheelMessageTimeout = setTimeout(() => {
            this.msgDiv.nativeElement.style.opacity = 0;
        }, 2000);
    }

    private syncPinPosition() {
        if (this.pinLocationValue === null || this.panzoom === null) {
            return;
        }
        const location = this.getPinLocation();
        if (!location) return;

        this.pinDiv.nativeElement.style.left = (location.x - this.pinDiv.nativeElement.width / 2) + 'px';
        this.pinDiv.nativeElement.style.top = (location.y - this.pinDiv.nativeElement.height / 2) + 'px';
        this.pinDiv.nativeElement.style.display = 'block';
    }

    public clearPin(){
        this.pinLocation = null;
        this.pinDiv.nativeElement.style.display = 'none';
    }

    private getPinLocation(): CoordsXY {

        if (this.panzoom === null) {
            return;
        }

        const zoom = this.panzoom.getScale();

        const rect = this.img.nativeElement.getClientRects()[0];
        if (!rect) return;
        const parentRect = this.img.nativeElement.parentElement.getClientRects()[0];

        const naturalWidth = this.img.nativeElement.naturalWidth;
        const naturalHeight = this.img.nativeElement.naturalHeight;
        
        const width = rect.width / zoom; //this.img.nativeElement.width;
        const height = rect.height / zoom; //this.img.nativeElement.height;
        
        const scaleX = width / naturalWidth;
        const scaleY = height / naturalHeight;

        const left = (rect.left - parentRect.left) + this.pinLocationValue.x * scaleX * zoom;
        const top = (rect.top - parentRect.top) + this.pinLocationValue.y * scaleY * zoom;

        return { x: left, y: top };
    }

    ngOnInit(): void {
    }

    private _fitToContainer(): void {
        const img = this.img.nativeElement;
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh || !this.panzoom) return;
        const container = this.el.nativeElement;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (!cw || !ch) return;
        const s = Math.min(cw / nw, ch / nh);
        const fw = Math.round(nw * s);
        const fh = Math.round(nh * s);
        // Set an explicit CSS size equal to the fitted dimensions so that panzoom
        // scale=1 means "fit to container", bypassing the 320px CSS constraints.
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.width = `${fw}px`;
        img.style.height = `${fh}px`;
        this.panzoom.zoom(1, { animate: false });
        // At scale=1 visual top-left = (panX, panY), so center directly.
        this.panzoom.pan((cw - fw) / 2, (ch - fh) / 2, { animate: false });
    }

    private getPos(e: MouseEvent): CoordsXY {
        const zoom = this.panzoom.getScale();

        const rect = this.img.nativeElement.getClientRects()[0];
        const naturalWidth = this.img.nativeElement.naturalWidth;
        const naturalHeight = this.img.nativeElement.naturalHeight;
        const width = rect.width / zoom; //this.img.nativeElement.width;
        const height = rect.height / zoom; //this.img.nativeElement.height;
        const scaleX = width / naturalWidth;
        const scaleY = height / naturalHeight;

        const relx = e.clientX - rect.left;
        const rely = e.clientY - rect.top;

        const x = relx / zoom;
        const y = rely / zoom;

        const realX = x / scaleX;
        const realY = y / scaleY;

        return { x: realX, y: realY };
    }

}
