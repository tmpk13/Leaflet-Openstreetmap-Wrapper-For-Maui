/**
 * Simple leaflet wrapper using openstreetmaps
 *
 * Mapper
 * 
 *  Initalize:
 *      Args:
 *          lat (float): inital map latitude
 *          long (float): inital map longitude
 *          zoom (float): inital zoom
 *          maker_list ( list [ list [lat, long], ... ] ): inital marker list to use
 * 
 *  Usage:
 *      Basic:
 *          (async () => {
 *              await new Mapper({
 *                  coord: {lat:0, long:0},
 *                  zoom: 13, 
 *                  marker_list: [{"address", "Place"}, {"lat": 0, "long": 0}]
 *              }).draw();
 *          })();
 *      Locate Icon:
 *          let icon = {icon_url:"./image.png", icon_x:50, icon_y:100, icon_w:100, icon_h:100};
*/

class Mapper {
    constructor(config = {}) {
        const {
            coord = {lat: 0, long: 0},
            zoom = 13,
            marker_list = [],
            create_div = true,
            div_id = "map-display-div-id",
            rate_limit_ms = 1000,
            locate_on_start=false
        } = config;
        
        this.locate_on_start = locate_on_start;

        this.lat = coord.lat;
        this.long = coord.long;
        
        this.zoom = zoom;
        this.marker_list = marker_list;
        this.map = null;

        // Style for map container
        this.style = `
            display: block;
            position: absolute;
            top:0;
            left: 0;
            height: 100vh;
            width: 100vw;
            margin: 0;
        `;

        this.map_display_div_id = div_id;

        // Wether to automatically create div element in html body
        this.create_div = create_div;
        
        this.last_geocode_time = 0;
        
        // Must be >= 1000 ms
        if ( rate_limit_ms < 1000 ) rate_limit_ms = 1000;
        this.min_geocode_interval = rate_limit_ms;
        
    }

    move_to(lat, long, zoom=13) {
        this.map.setView(new L.LatLng(lat, long), zoom);
    }

    async locate_user(icon=null, on_error=null) {
        this.map.locate()
            .on('locationfound', async (e) => {
                await this.add_marker(e.latitude, e.longitude, "User Location", "", icon);
                const circle = L.circleMarker([e.latitude, e.longitude], e.accuracy/2, {
                    weight: 1,
                    color: 'blue'
                });
                this.map.addLayer(circle);
            })
            .on('locationerror', (e) => {
                console.error('Location error:', e);
                if (on_error) on_error(e);
                else throw new Error('Location access denied');
            });
    }

    async #draw_map() {
        if ( this.create_div ) {
            let div = document.createElement('div');
            div.setAttribute('id', this.map_display_div_id);
            div.setAttribute('style', this.style);
            document.body.appendChild(div);
        }
        this.map = L.map(this.map_display_div_id).setView([this.lat, this.long], this.zoom);
        
        var layer = new L.TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });
        this.map.addLayer(layer);
        
        if ( Array.isArray(this.marker_list) && this.marker_list.length > 0 ) {
            await this.#add_marker_list(this.marker_list);
        }
    }

    async draw(json_string=null) {
        if (typeof L === 'undefined') {
            throw new Error('Leaflet not loaded. Import L from Leaflet before using Mapper.');
        }
        if ( json_string === null ) {
            await this.#draw_map();
        } else {
            await this.draw_from_json(json_string);
        }
        if ( this.locate_on_start ) { 
            await this.locate_user()
        }
    }

    async #add_marker(lat, long, alt, popup, icon_config=null) {
        let icon_element = null;
        if ( icon_config ) {
            const {icon_url, icon_x=50, icon_y=100, icon_w=100, icon_h=100} = icon_config;

            icon_element = new L.icon(
                {
                    iconUrl: icon_url,
                    iconSize: [icon_w, icon_h],
                    iconAnchor: [icon_x, icon_y]
                }
            );
        }

        const marker_options = {alt: alt};
        if (icon_element) marker_options.icon = icon_element;

        const mark = new L.Marker([lat, long], marker_options);
        if (popup !== "") mark.bindTooltip(popup);

        mark.addTo(this.map);
    }

    async add_marker(lat, long, alt="Marker", popup="", icon=null) {
        await this.#add_marker(lat, long, alt, popup, icon);
    }

    async add_marker_list(marker_list) {
        await this.#add_marker_list(marker_list);
    }

    async #add_marker_list(marker_list) {
        if (!Array.isArray(marker_list)) {
            throw new Error('marker_list must be array');
        }

        const results = await Promise.allSettled(
            marker_list.map((m, i) => this.#process_marker(m, i))
        );
        
        const added = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected');
        
        if (failed.length > 0) {
            console.warn(`Markers: ${added} added, ${failed.length} failed`);
            failed.forEach(f => console.error(f.reason.message));
        }
        
        return results;
    }

    async #process_marker(marker_data, index) {
        // Validate input
        if (!marker_data || typeof marker_data !== 'object') {
            throw new Error(`Marker ${index}: invalid marker data`);
        }

        // Address lookup: {address: "123 Main St"}
        if (marker_data.address) {
            if (!marker_data.address.trim()) {
                throw new Error(`Marker ${index}: empty address`);
            }
            const locations = await this.addr_to_coord(marker_data.address);
            if (!locations?.length) {
                throw new Error(`Marker ${index}: address not found`);
            }
            const markers = [];
            for (const loc of locations) {
                const lat = parseFloat(loc.lat);
                const lon = parseFloat(loc.lon);
                if (isNaN(lat) || isNaN(lon)) continue;
                const popup = loc.display_name || "None";
                markers.push(
                    await this.#add_marker(lat, lon, marker_data.address, popup)
                );
            }
            return markers;
        }

        // Coordinate lookup: {lat, long, alt?, popup?, icon?}
        const {lat, long, alt = "Marker", popup = "", icon = {}} = marker_data;
        if (lat == null || long == null) {
            throw new Error(`Marker ${index}: missing lat/long or address`);
        }
        if (isNaN(lat) || isNaN(long)) {
            throw new Error(`Marker ${index}: invalid coords`);
        }
        return this.#add_marker(lat, long, alt, popup, icon);
    }
    
    async #draw_from_json(json_string) {
        try {
            var map_conf = JSON.parse(json_string);

            this.lat = map_conf.position.lat;
            this.long = map_conf.position.long;
            this.zoom = map_conf.position.zoom;
            await this.#draw_map();
            if ( map_conf.markers.length > 0 ) {
                await this.#add_marker_list(map_conf.markers);
            }
        }
        catch {
            console.warn("Invalid JSON Provided");
        }
    }

    async draw_from_json(json_string) {
        await this.#draw_from_json(json_string);
    }

    async addr_to_coord(address, limit=1) {
        const now = Date.now();
        const elapsed = now - this.last_geocode_time;
        
        if (elapsed < this.min_geocode_interval) {
            await new Promise(r => 
                setTimeout(r, this.min_geocode_interval - elapsed));
        }
        
        this.last_geocode_time = Date.now();
        
        if (!address?.trim()) throw new Error('Invalid address');

        const url = `https://api.stadiamaps.com/geocoding/v1/search?text=${encodeURIComponent(address.trim())}`;
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Stadia-Auth ${env.STAD_API_KEY}`
            }
        });
        
        if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
        return response.json();
    }

    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        document.getElementById(this.map_display_div_id)?.remove();
    }
}
