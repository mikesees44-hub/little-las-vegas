/**
 * The business-location layer: every placed property as a GeoJSON Feature
 * (flat, pure data). One feature is one occupant of a building: `building` is
 * the permanent building id (the lot id where the game has a lot), and a
 * building can have several features over the years — the map shows the one
 * whose `opened`..`closed` covers the game year (missing = not known).
 *
 *   geometry      [lng, lat] of the footprint's middle
 *   rotation      degrees, clockwise, relative to the street grid (0 = facing the ocean)
 *   footprint     width along the street × depth, in meters
 *   images        asset-store keys (art/assetUrls.ts in the UI): exterior views, a four-angle sheet, an interior
 *   located       'verified' only when the point itself comes from a source; else 'approximate'
 *   source        where the location (and the years) come from, and what is not sourced
 *
 * Coordinates were generated from the game's street frame, anchored on the
 * sourced Hunt's Pier point; corrections made in the map editor are exported
 * as GeoJSON to be folded back in here.
 */

export interface PlaceProps {
  building: string;
  lotId?: string;
  name: string;
  kind: string;
  address: string;
  opened?: number;
  closed?: number;
  /** The years are placeholders, not sourced. */
  datesApprox?: boolean;
  /** A landmark establishment (named for a real person): visitable, never owned. */
  establishment?: boolean;
  /** A public building or landmark (a city hall, the lighthouse): never for sale. */
  public?: boolean;
  rotation: number;
  footprint: { w: number; d: number };
  images: { exterior?: string[]; turnaround?: string; interior?: string };
  located: 'verified' | 'approximate';
  source: string;
}

export interface PlaceFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: PlaceProps;
}

/** The street frame the layer is drawn in: the game's island frame (u along the island, v inland, meters), pinned to the map. */
export const PLACE_FRAME = { anchor: { lat: 38.989378, lng: -74.80456 }, anchorUV: [3750, -125] as [number, number], bearing: 49.2 };

export const PLACES: PlaceFeature[] = [
  {"type":"Feature","id":"hunts-pier","geometry":{"type":"Point","coordinates":[-74.80456,38.989378]},"properties":{"building":"pier:hunts","name":"Hunt's Pier","kind":"pier","address":"2701 Boardwalk","opened":1957,"closed":1985,"rotation":180,"footprint":{"w":74,"d":210},"images":{"exterior":["hunts_pier_golf_entrance"]},"located":"verified","source":"Coordinates: Coasterpedia, \"Dinosaur Beach\" (38.989378, -74.804560). Address and the Hunt's Pier years (1957-1985): Wikipedia, \"Hunt's Pier\". Philadelphia Architects & Buildings puts the earlier Ocean Pier on this site near E Poplar and E Juniper Aves; the game's street grid calls the cross street Oak Ave."}},
  {"type":"Feature","id":"hunts-flyer","geometry":{"type":"Point","coordinates":[-74.804371,38.989208]},"properties":{"building":"pier:hunts:2","lotId":"pr01","name":"The Flyer","kind":"ride","address":"Hunt's Pier","opened":1957,"rotation":0,"footprint":{"w":60,"d":46},"images":{},"located":"approximate","source":"A ride of the game's on the pier deck; its spot on the deck is approximate."}},
  {"type":"Feature","id":"hunts-slide","geometry":{"type":"Point","coordinates":[-74.804734,38.989617]},"properties":{"building":"pier:hunts:1","name":"The water slide","kind":"ride","address":"Hunt's Pier","opened":1978,"closed":1985,"datesApprox":true,"rotation":0,"footprint":{"w":40,"d":40},"images":{"exterior":["wipeout_slide"]},"located":"approximate","source":"A late-era attraction (the painting is of the 1970s-80s); the years are placeholders, not sourced."}},
  {"type":"Feature","id":"ocean-theatre","geometry":{"type":"Point","coordinates":[-74.805402,38.990783]},"properties":{"building":"bw:ocean-theatre","name":"The Ocean Theatre (Skyline Golf on the roof)","kind":"theater","address":"Boardwalk, opposite Hunt's Pier","rotation":0,"footprint":{"w":70,"d":66},"images":{"exterior":["hunts_pier_golf_entrance"]},"located":"approximate","source":"Wikipedia (\"Hunt's Pier\"): the Skyline Golf sign stood opposite the pier atop the Ocean Theater. Its footprint and years are not sourced."}},
  {"type":"Feature","id":"bw08","geometry":{"type":"Point","coordinates":[-74.807246,38.989546]},"properties":{"building":"bw08","lotId":"bw08","name":"Moonglow Miniature Golf","kind":"minigolf","address":"Boardwalk at Spicer Ave","opened":1957,"rotation":0,"footprint":{"w":37,"d":66},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw09","geometry":{"type":"Point","coordinates":[-74.806874,38.989795]},"properties":{"building":"bw09","lotId":"bw09","name":"Surrey & Bike Rental","kind":"shop","address":"Boardwalk at Spicer Ave","opened":1946,"rotation":0,"footprint":{"w":37,"d":66},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw10","geometry":{"type":"Point","coordinates":[-74.806415,38.990103]},"properties":{"building":"bw10","lotId":"bw10","name":"The Hurricane Room","kind":"club","address":"Boardwalk at Magnolia Ave","opened":1948,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["anchor_tavern"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw11","geometry":{"type":"Point","coordinates":[-74.806043,38.990353]},"properties":{"building":"bw11","lotId":"bw11","name":"Funland Novelties","kind":"shop","address":"Boardwalk at Magnolia Ave","opened":1950,"closed":1971,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["boardwalk_fun_shop"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw12","geometry":{"type":"Point","coordinates":[-74.804753,38.991219]},"properties":{"building":"bw12","lotId":"bw12","name":"Neptune's Fish House","kind":"restaurant","address":"Boardwalk at Pine Ave","opened":1936,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["lobster_seafood_house"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw13","geometry":{"type":"Point","coordinates":[-74.804381,38.991468]},"properties":{"building":"bw13","lotId":"bw13","name":"Lucky Strike Skee-Ball","kind":"arcade","address":"Boardwalk at Pine Ave","opened":1941,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["lucky_sevens_arcade"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw14","geometry":{"type":"Point","coordinates":[-74.803922,38.991776]},"properties":{"building":"bw14","lotId":"bw14","name":"The Wave Crest Hotel","kind":"hotel","address":"Boardwalk at Wildwood Ave","opened":1929,"rotation":0,"footprint":{"w":37,"d":66},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw15","geometry":{"type":"Point","coordinates":[-74.803091,38.992334]},"properties":{"building":"bw15","lotId":"bw15","name":"Coney Island Hot Dogs","kind":"food","address":"Boardwalk at Spencer Ave","opened":1953,"rotation":0,"footprint":{"w":37,"d":66},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw16","geometry":{"type":"Point","coordinates":[-74.802719,38.992583]},"properties":{"building":"bw16","lotId":"bw16","name":"Seaside Beachwear","kind":"shop","address":"Boardwalk at Spencer Ave","opened":1947,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["boardwalk_fun_shop"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw11-funshop","geometry":{"type":"Point","coordinates":[-74.806043,38.990353]},"properties":{"building":"bw11","lotId":"bw11","name":"The Boardwalk Fun Shop","kind":"shop","address":"Boardwalk at Magnolia Ave","opened":1972,"datesApprox":true,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["boardwalk_fun_shop"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor. A later occupant of the same building (fictional years)."}},
  {"type":"Feature","id":"pa05","geometry":{"type":"Point","coordinates":[-74.807316,38.992513]},"properties":{"building":"pa05","lotId":"pa05","name":"The Seven Seas Supper Club","kind":"club","address":"Pacific Ave at Oak Ave","opened":1938,"rotation":180,"footprint":{"w":79,"d":52},"images":{"exterior":[]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"pa03","geometry":{"type":"Point","coordinates":[-74.806299,38.993195]},"properties":{"building":"pa03","lotId":"pa03","name":"Club Riviera","kind":"club","address":"Pacific Ave at Pine Ave","opened":1953,"rotation":180,"footprint":{"w":37,"d":52},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"sa20","geometry":{"type":"Point","coordinates":[-74.807659,38.993114]},"properties":{"building":"sa20","lotId":"sa20","name":"The Red Garter","kind":"saloon","address":"Pacific Ave at Oak Ave","opened":1958,"datesApprox":true,"rotation":0,"footprint":{"w":37,"d":52},"images":{"turnaround":"red_garter_turnaround","interior":"red_garter_interior_twilight"},"located":"approximate","source":"A long-gone banjo saloon (real name kept). Its block and its years are not sourced."}},
  {"type":"Feature","id":"sa05","geometry":{"type":"Point","coordinates":[-74.805009,38.994061]},"properties":{"building":"sa05","lotId":"sa05","name":"The Shamrock","kind":"tavern","address":"3700 Pacific Ave","opened":1899,"rotation":180,"footprint":{"w":37,"d":52},"images":{"turnaround":"shamrock_turnaround","interior":"shamrock_twilight"},"located":"approximate","source":"Address: 3700 Pacific Ave, from the user's research. Which block that is on the game's grid is a guess (Spencer Ave); the point is approximate."}},
  {"type":"Feature","id":"sa08","geometry":{"type":"Point","coordinates":[-74.809164,38.991273]},"properties":{"building":"sa08","lotId":"sa08","name":"Bellavita","kind":"restaurant","address":"Pacific Ave at Spicer Ave","opened":1951,"rotation":180,"footprint":{"w":37,"d":52},"images":{"turnaround":"bellavita_restaurant_turnaround"},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"sa09","geometry":{"type":"Point","coordinates":[-74.80849,38.992556]},"properties":{"building":"sa09","lotId":"sa09","name":"Bayview Deli","kind":"deli","address":"Pacific Ave at Magnolia Ave","opened":1949,"rotation":0,"footprint":{"w":37,"d":52},"images":{"turnaround":"bayview_deli_turnaround"},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"pa01","geometry":{"type":"Point","coordinates":[-74.809693,38.991749]},"properties":{"building":"pa01","lotId":"pa01","name":"The Blue Moon","kind":"club","address":"Pacific Ave at Spicer Ave","opened":1946,"rotation":0,"footprint":{"w":37,"d":52},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"pa02","geometry":{"type":"Point","coordinates":[-74.806368,38.993979]},"properties":{"building":"pa02","lotId":"pa02","name":"The Velvet Rope","kind":"club","address":"Pacific Ave at Wildwood Ave","opened":1950,"rotation":0,"footprint":{"w":37,"d":52},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"club-avalon","geometry":{"type":"Point","coordinates":[-74.793986,39.006612]},"properties":{"building":"nw:club-avalon","name":"Club Avalon","kind":"landmark","address":"Spruce Ave & Olde New Jersey Ave, North Wildwood","establishment":true,"rotation":0,"footprint":{"w":40,"d":45},"images":{},"located":"approximate","source":"Cross streets as given (Spruce Ave & Olde New Jersey Ave). The point is placed roughly in North Wildwood (on the game's grid near Olde New Jersey Ave and 4th) and is not geocoded. A real entertainer's club: an establishment only, never owned, never in a racket or a crime story."}},
  // Batch 2 and 3, block by block from Hunt's Pier. The Boardwalk north from the Sportland Pier into North Wildwood.
  {"type":"Feature","id":"bw-sportsland","geometry":{"type":"Point","coordinates":[-74.800163,38.994751]},"properties":{"building":"ll:bw-sportsland","name":"Sportsland Bike Rental","kind":"shop","address":"Boardwalk at Rio Grande Ave","images":{"exterior":["storefront_sportsland"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A still-operating business: shown under a near-miss name. By the old Sportland Pier; its years are not known. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-nutty-hut","geometry":{"type":"Point","coordinates":[-74.799994,38.994909]},"properties":{"building":"ll:bw-nutty-hut","name":"The Nutty Hut","kind":"food","address":"Boardwalk at Rio Grande Ave","images":{"exterior":["storefront_nutty_hut"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A still-operating business: shown under a near-miss name. Its years are not known. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-old-macks","geometry":{"type":"Point","coordinates":[-74.799786,38.995104]},"properties":{"building":"ll:bw-old-macks","name":"Old Mack's Pizza","kind":"food","address":"Boardwalk at Davis Ave","opened":1953,"datesApprox":true,"images":{"exterior":["storefront_old_macks_pizza"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A still-operating business: shown under a near-miss name. The year is a placeholder, not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-bazaar","geometry":{"type":"Point","coordinates":[-74.799617,38.995262]},"properties":{"building":"ll:bw-bazaar","name":"Boardwalk Bazaar","kind":"shop","address":"Boardwalk at Davis Ave","images":{"exterior":["storefront_boardwalk_bazaar"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A fictional souvenir shop. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-olympia","geometry":{"type":"Point","coordinates":[-74.799408,38.995457]},"properties":{"building":"ll:bw-olympia","name":"Olympia Fascination","kind":"arcade","address":"Boardwalk at Crocker Ave","images":{"exterior":["storefront_olympia_fascination"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A still-operating business: shown under a near-miss name. Its years are not known. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-taffy-tides","geometry":{"type":"Point","coordinates":[-74.799239,38.995615]},"properties":{"building":"ll:bw-taffy-tides","name":"Taffy Tides","kind":"food","address":"Boardwalk at Crocker Ave","images":{"exterior":["storefront_taffy_tides"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A fictional candy shop. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-eds-fun-arcade","geometry":{"type":"Point","coordinates":[-74.799031,38.99581]},"properties":{"building":"ll:bw-eds-fun-arcade","name":"Ed's Fun Arcade","kind":"arcade","address":"Boardwalk at Leaming Ave","images":{"exterior":["storefront_eds_fun_arcade"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A still-operating business: shown under a near-miss name. Its years are not known. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-flashback","geometry":{"type":"Point","coordinates":[-74.798862,38.995968]},"properties":{"building":"ll:bw-flashback","name":"Flashback Photo","kind":"shop","address":"Boardwalk at Leaming Ave","opened":1972,"datesApprox":true,"images":{"exterior":["storefront_flashback_photo"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A fictional old-time portrait studio; the year is a placeholder. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-casino-arcadia","geometry":{"type":"Point","coordinates":[-74.798643,38.996172]},"properties":{"building":"ll:bw-casino-arcadia","name":"Casino Arcadia","kind":"arcade","address":"Boardwalk at Andrews Ave","images":{"exterior":["storefront_casino_arcadia"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A still-operating business: shown under a near-miss name. Its years are not known. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-surfside","geometry":{"type":"Point","coordinates":[-74.798454,38.996349]},"properties":{"building":"ll:bw-surfside","name":"Surfside Outfitters","kind":"shop","address":"Boardwalk at Andrews Ave","images":{"exterior":["storefront_surfside_outfitters"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A fictional beachwear store. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-lil-nickys","geometry":{"type":"Point","coordinates":[-74.798088,38.996691]},"properties":{"building":"ll:bw-lil-nickys","name":"Lil' Nicky's Pizza","kind":"food","address":"Boardwalk at 26th Ave, North Wildwood","opened":1985,"datesApprox":true,"images":{"exterior":["storefront_lil_nickys"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A still-operating business: shown under a near-miss name. A late-era stand; the year is a placeholder. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-gateway-25","geometry":{"type":"Point","coordinates":[-74.797816,38.996946]},"properties":{"building":"ll:bw-gateway-25","name":"Gateway 25 (Kohl Bros. Frozen Custard)","kind":"arcade","address":"Boardwalk at 25th Ave, North Wildwood","images":{"exterior":["storefront_gateway_25"]},"rotation":0,"footprint":{"w":66,"d":48},"located":"approximate","source":"A still-operating business: shown under a near-miss name. An arcade with the custard stand in its corner; its years are not known. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-fudge-kitchenette","geometry":{"type":"Point","coordinates":[-74.797543,38.9972]},"properties":{"building":"ll:bw-fudge-kitchenette","name":"The Fudge Kitchenette","kind":"food","address":"Boardwalk at 24th Ave, North Wildwood","opened":1972,"datesApprox":true,"images":{"exterior":["storefront_fudge_kitchenette"]},"rotation":0,"footprint":{"w":32,"d":40},"located":"approximate","source":"A still-operating business: shown under a near-miss name. The year is a placeholder. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  // North Wildwood: the Lollypop Motel and its sign on Atlantic Avenue, City Hall, the lighthouse.
  {"type":"Feature","id":"nw-lollypop","geometry":{"type":"Point","coordinates":[-74.798206,38.998439]},"properties":{"building":"ll:nw-lollypop","name":"The Lollypop Motel","kind":"motel","address":"2301 Atlantic Ave, North Wildwood","images":{"exterior":["cutout_lollypop_motel","motel_lollypop"]},"rotation":180,"footprint":{"w":33,"d":52},"located":"approximate","source":"A still-operating business: shown under a near-miss name. Address and corner (the northbound side of Atlantic at 23rd Ave): Roadside America. Its years are not known. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"nw-lollypop-sign","geometry":{"type":"Point","coordinates":[-74.798418,38.998545]},"properties":{"building":"ll:nw-lollypop:sign","name":"The Lollypop Motel sign","kind":"sign","address":"2301 Atlantic Ave, North Wildwood","rotation":180,"footprint":{"w":5,"d":5},"images":{"exterior":["sign_lollypop"]},"located":"approximate","source":"The motel's standalone sign, at its Atlantic Avenue corner. Placed with the motel."}},
  {"type":"Feature","id":"nw-city-hall","geometry":{"type":"Point","coordinates":[-74.794111,39.003238]},"properties":{"building":"ll:nw-city-hall","name":"North Wildwood City Hall","kind":"civic","address":"901 Atlantic Ave, North Wildwood","public":true,"images":{"exterior":["cutout_nw_city_hall","landmark_nw_city_hall"]},"rotation":0,"footprint":{"w":60,"d":44},"located":"approximate","source":"Address: the City of North Wildwood (northwildwood.com, historical markers). When this building went up is not given there (the city's older halls stood at Walnut & New York and at 3rd & Central), so the years are not shown. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"hereford-light","geometry":{"type":"Point","coordinates":[-74.79222,39.00667]},"properties":{"building":"nw:hereford-light","name":"The Hereford Inlet Light","kind":"lighthouse","address":"First Ave & Central Ave, North Wildwood","opened":1874,"public":true,"rotation":0,"footprint":{"w":26,"d":24},"images":{"exterior":["cutout_hereford_light","landmark_hereford_light"]},"located":"verified","source":"Coordinates (39.00667, -74.79222), the corner of First and Central Avenues and the year (1874): Wikipedia, \"Hereford Inlet Lighthouse\". The game's island is drawn longer than the real one, so the map's frame is pinned here as its second sourced point. A public landmark (real name kept): never for sale."}},
  // Pacific Avenue: the clubs round the Taylor Avenue block, the Rainbow at Spicer; a pizzeria on Atlantic.
  {"type":"Feature","id":"pa-quo-vadis","geometry":{"type":"Point","coordinates":[-74.813018,38.989518]},"properties":{"building":"ll:pa-quo-vadis","name":"Quo Vadis","kind":"club","address":"Pacific Ave at Montgomery Ave","images":{"exterior":["club_quo_vadis"]},"rotation":0,"footprint":{"w":37,"d":52},"located":"approximate","source":"A long-gone lounge (real name kept). Its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"pa-oasis","geometry":{"type":"Point","coordinates":[-74.812646,38.989768]},"properties":{"building":"ll:pa-oasis","name":"The Oasis","kind":"club","address":"Pacific Ave at Montgomery Ave","images":{"exterior":["club_oasis"]},"rotation":0,"footprint":{"w":37,"d":52},"located":"approximate","source":"A nightclub; its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"pa-riptide","geometry":{"type":"Point","coordinates":[-74.812489,38.989042]},"properties":{"building":"ll:pa-riptide","name":"The Riptide","kind":"club","address":"Pacific Ave at Montgomery Ave","images":{"exterior":["club_riptide"]},"rotation":180,"footprint":{"w":37,"d":52},"located":"approximate","source":"A long-gone club (real name kept). Its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"pa-stardust","geometry":{"type":"Point","coordinates":[-74.812117,38.989292]},"properties":{"building":"ll:pa-stardust","name":"The Stardust","kind":"club","address":"Pacific Ave at Montgomery Ave","images":{"exterior":["club_stardust"]},"rotation":180,"footprint":{"w":37,"d":52},"located":"approximate","source":"A nightclub; its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"at-romeos","geometry":{"type":"Point","coordinates":[-74.81128,38.98926]},"properties":{"building":"ll:at-romeos","name":"Romeo's Pizzeria","kind":"food","address":"Atlantic Ave at Taylor Ave","opened":1961,"datesApprox":true,"images":{"exterior":["storefront_romeos_pizzeria"]},"rotation":0,"footprint":{"w":37,"d":52},"located":"approximate","source":"A fictional pizzeria; its mural is of \"Let's Twist Again\" (1961), so it opens in 1961 (a placeholder). Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"pa-rainbow","geometry":{"type":"Point","coordinates":[-74.809624,38.990965]},"properties":{"building":"ll:pa-rainbow","name":"The Rainbow Club","kind":"club","address":"Pacific Ave at Spicer Ave (the corner)","opened":1950,"closed":1979,"datesApprox":true,"images":{"exterior":["club_rainbow_marquee","club_rainbow_musical_bar"]},"rotation":180,"footprint":{"w":37,"d":52},"located":"approximate","source":"Cape May Magazine, \"A Tale of Two Wildwoods\": at the corner of Pacific and Spicer Avenues, on the east side; the Levy family ran it from the 1950s into the 1970s (Chubby Checker played it in 1960). The corner is sourced; the exact years are not. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  // The Crest: Atlantic Avenue motels (addresses from the user's notes; the blocks on the game's grid are approximate).
  {"type":"Feature","id":"at-ebb-tyde","geometry":{"type":"Point","coordinates":[-74.821283,38.981718]},"properties":{"building":"ll:at-ebb-tyde","name":"The Ebb Tyde Motel","kind":"motel","address":"5711 Atlantic Ave, Wildwood Crest","opened":1957,"images":{"exterior":["motel_ebb_tyde"]},"rotation":180,"footprint":{"w":89,"d":52},"located":"approximate","source":"A still-operating business: shown under a near-miss name. Address 5711 Atlantic Ave and the year (1957): the user's notes. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"at-satellite","geometry":{"type":"Point","coordinates":[-74.822409,38.980963]},"properties":{"building":"ll:at-satellite","name":"The Satellite Motel","kind":"motel","address":"5909 Atlantic Ave, Wildwood Crest","opened":1958,"images":{"exterior":["motel_satellite"]},"rotation":180,"footprint":{"w":42,"d":52},"located":"approximate","source":"Demolished (the real name kept). Address 5909 Atlantic Ave and the year built (1958): the user's notes; when it came down is not in them. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"at-schumanns","geometry":{"type":"Point","coordinates":[-74.821994,38.981241]},"properties":{"building":"ll:at-schumanns","name":"Schumann's Restaurant","kind":"restaurant","address":"5901 Atlantic Ave, Wildwood Crest","images":{"exterior":["storefront_schumanns"]},"rotation":180,"footprint":{"w":42,"d":52},"located":"approximate","source":"Long closed (the real name kept). Address 5901 Atlantic Ave: the user's notes; its years are not known. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  // Batch 4: the user's three-quarter models. Six ownable 1960 records (Klug's, the Hurricane, Groff's, the Boathouse, the Wai-Kiki, the Malibu Beach),
  // the bayfront, the churches and the high school, a corner bar and a deli.
  {"type":"Feature","id":"sb01","geometry":{"type":"Point","coordinates":[-74.798243,38.996546]},"properties":{"building":"sb01","lotId":"sb01","name":"Klug's","kind":"restaurant","address":"Boardwalk at 26th Ave, North Wildwood","opened":1948,"datesApprox":true,"images":{"exterior":["cutout_klugs","storefront_klugs"]},"rotation":0,"footprint":{"w":33,"d":66},"located":"approximate","source":"A still-operating breakfast place, under the name the user chose (Klug's); open from 1960 in the game. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"sb02","geometry":{"type":"Point","coordinates":[-74.810983,38.990883]},"properties":{"building":"sb02","lotId":"sb02","name":"The Hurricane Club","kind":"club","address":"Pacific Ave at Burk Ave","images":{"exterior":["cutout_hurricane","club_hurricane"]},"rotation":0,"footprint":{"w":37,"d":52},"located":"approximate","source":"A long-gone club (real name kept): live music and dancing, and yours to buy. Its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"sb03","geometry":{"type":"Point","coordinates":[-74.81103,38.987007]},"properties":{"building":"sb03","lotId":"sb03","name":"Groff's Restaurant","kind":"restaurant","address":"Boardwalk at Bennett Ave","images":{"exterior":["cutout_groffs"]},"rotation":0,"footprint":{"w":37,"d":66},"located":"approximate","source":"Closed (real name kept). Its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"sb04","geometry":{"type":"Point","coordinates":[-74.805093,38.997959]},"properties":{"building":"sb04","lotId":"sb04","name":"The Boathouse","kind":"restaurant","address":"Park Blvd at Youngs Ave, by Otten's Harbor","images":{"exterior":["cutout_boathouse"]},"rotation":0,"footprint":{"w":79,"d":52},"located":"approximate","source":"A fictional bayfront restaurant on pilings, its docks over the water: boats tie up at the back door. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"sb05","geometry":{"type":"Point","coordinates":[-74.819458,38.981519]},"properties":{"building":"sb05","lotId":"sb05","name":"The Wai-Kiki Oceanfront Resort","kind":"motel","address":"Ocean Ave at Buttercup Rd, Wildwood Crest","images":{"exterior":["cutout_wai_kiki"]},"rotation":180,"footprint":{"w":89,"d":52},"located":"approximate","source":"A still-operating business: shown under a near-miss name. Its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"sb06","geometry":{"type":"Point","coordinates":[-74.822214,38.97967]},"properties":{"building":"sb06","lotId":"sb06","name":"The Malibu Beach Motel","kind":"motel","address":"Ocean Ave at Atlanta Ave, Wildwood Crest","images":{"exterior":["cutout_malibu_beach_motel"]},"rotation":180,"footprint":{"w":89,"d":52},"located":"approximate","source":"A motel that may still operate: shown under a near-miss name. Its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"pa-shore-comedy","geometry":{"type":"Point","coordinates":[-74.81332,38.988485]},"properties":{"building":"ll:pa-shore-comedy","name":"The Shore Comedy Club","kind":"comedy","address":"Pacific Ave at Bennett Ave","opened":1982,"datesApprox":true,"images":{"turnaround":"shore_comedy_turnaround","interior":"shore_comedy_interior"},"rotation":180,"footprint":{"w":37,"d":52},"located":"approximate","source":"A fictional comedy club of the 1980s boom; the year is a placeholder. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"pa-uncle-vinnys","geometry":{"type":"Point","coordinates":[-74.812948,38.988734]},"properties":{"building":"ll:pa-uncle-vinnys","name":"Uncle Vinny's Comedy Club","kind":"comedy","address":"Pacific Ave at Bennett Ave","opened":1984,"datesApprox":true,"images":{"interior":"uncle_vinnys_stage"},"rotation":180,"footprint":{"w":37,"d":52},"located":"approximate","source":"A near-miss name for a comedy club that operates elsewhere (not in Wildwood); placed here as a fictional room. The year is a placeholder. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"pa-fairview","geometry":{"type":"Point","coordinates":[-74.810524,38.991191]},"properties":{"building":"ll:pa-fairview","name":"The Fairview","kind":"tavern","address":"Pacific Ave at Cedar Ave","images":{"exterior":["cutout_fairview"]},"rotation":0,"footprint":{"w":37,"d":52},"located":"approximate","source":"A local corner bar and cafe, \"Home of Beat the Clock\" (the name is provisional, pending the user). Its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"at-bils","geometry":{"type":"Point","coordinates":[-74.810449,38.989818]},"properties":{"building":"ll:at-bils","name":"Bil's Corner Deli","kind":"deli","address":"Atlantic Ave at Burk Ave","images":{"exterior":["cutout_bils_corner_deli"]},"rotation":0,"footprint":{"w":37,"d":52},"located":"approximate","source":"A corner deli whose real namesake may still operate: shown under a near-miss name. Its block and years are not sourced. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"pa-wildwood-high","geometry":{"type":"Point","coordinates":[-74.810641,38.990282]},"properties":{"building":"ll:pa-wildwood-high","name":"Wildwood High School","kind":"school","address":"4300 Pacific Ave, Wildwood","opened":1917,"public":true,"images":{"exterior":["cutout_wildwood_high"]},"rotation":180,"footprint":{"w":79,"d":52},"located":"approximate","source":"Address and the year the building opened (1917): Wikipedia, \"Wildwood High School\". The 4300 block is between Cedar and Burk Avenues; on the game's grid that is the Burk Ave block. A public landmark: the player's children go to school here. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"nj-st-anselms","geometry":{"type":"Point","coordinates":[-74.813209,38.989983]},"properties":{"building":"ll:nj-st-anselms","name":"St. Anselm's Parish","kind":"church","address":"New Jersey Ave at Montgomery Ave","public":true,"images":{"exterior":["cutout_st_anselms"]},"rotation":180,"footprint":{"w":79,"d":52},"located":"approximate","source":"A fictional Catholic parish church and school: weddings, funerals, Sunday Mass. A public landmark, never for sale, never in a crime story. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"nj-holy-redeemer","geometry":{"type":"Point","coordinates":[-74.812378,38.990541]},"properties":{"building":"ll:nj-holy-redeemer","name":"Holy Redeemer Church","kind":"church","address":"New Jersey Ave at Taylor Ave","public":true,"images":{"exterior":["cutout_holy_redeemer"]},"rotation":180,"footprint":{"w":79,"d":52},"located":"approximate","source":"A fictional stone church: a public landmark, never for sale, never in a crime story. Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bw-chapel","geometry":{"type":"Point","coordinates":[-74.811861,38.986449]},"properties":{"building":"ll:bw-chapel","name":"The Boardwalk Chapel","kind":"church","address":"Boardwalk at Hand Ave","public":true,"images":{"exterior":["cutout_boardwalk_chapel"]},"rotation":0,"footprint":{"w":30,"d":40},"located":"approximate","source":"A real ministry, still active (real name kept): a public landmark for scenes (a wedding, a talk with a preacher); never for sale, never in a crime story. A church directory gives a point for it, but the game's frame is not pinned south of Hunt's Pier, so it is placed by its Boardwalk block (approximate). Placed on the game's street grid; the point is approximate. Correct it in the editor."}},
  {"type":"Feature","id":"bay-urys","geometry":{"type":"Point","coordinates":[-74.805083,38.998661]},"properties":{"building":"ll:bay-urys","name":"Ury's Waterfront Restaurant","kind":"restaurant","address":"The bayfront at Rio Grande Ave","rotation":180,"footprint":{"w":60,"d":36},"images":{"exterior":["cutout_urys_waterfront"]},"located":"approximate","source":"A still-operating business: shown under a near-miss name. On the bay by the Rio Grande Avenue causeway; its spot is approximate."}},
];

const RAD = Math.PI / 180;
const M_LAT = 111320;

/** The plain rotation: island frame (u, v meters) → [lng, lat], true to scale. */
function rawToLngLat(u: number, v: number): [number, number] {
  const { anchor, anchorUV, bearing } = PLACE_FRAME;
  const du = u - anchorUV[0];
  const dv = v - anchorUV[1];
  const b = bearing * RAD;
  const bi = (bearing - 90) * RAD;
  const north = du * Math.cos(b) + dv * Math.cos(bi);
  const east = du * Math.sin(b) + dv * Math.sin(bi);
  return [anchor.lng + east / (M_LAT * Math.cos(anchor.lat * RAD)), anchor.lat + north / M_LAT];
}

function rawToUv(p: [number, number]): [number, number] {
  const { anchor, anchorUV, bearing } = PLACE_FRAME;
  const east = (p[0] - anchor.lng) * M_LAT * Math.cos(anchor.lat * RAD);
  const north = (p[1] - anchor.lat) * M_LAT;
  const b = bearing * RAD;
  const bi = (bearing - 90) * RAD;
  // The two axes are orthonormal: project onto each.
  return [anchorUV[0] + north * Math.cos(b) + east * Math.sin(b), anchorUV[1] + north * Math.cos(bi) + east * Math.sin(bi)];
}

/**
 * The game draws the island longer than it is (its streets are spaced from
 * memory), so one rotation fits only near its anchor. The frame is pinned at
 * a second sourced point, the Hereford Inlet Light (Wikipedia: 39.00667,
 * -74.79222, at First and Central Avenues), to the game's corner of 1st and
 * Central; between them the frame stretches along the island. Below
 * `WARP_FROM` (the Crest, Wildwood, Hunt's Pier) it is the plain rotation.
 */
const WARP_FROM = 4200;
const HEREFORD_LIGHT: [number, number] = [-74.79222, 39.00667];
const HEREFORD_UV: [number, number] = [7246, 365];
const WARP_PIN = (() => {
  const [bu, bv] = rawToUv(HEREFORD_LIGHT);
  return { bu, du: HEREFORD_UV[0] - bu, dv: HEREFORD_UV[1] - bv };
})();

/** The offset added to the plain frame at a plain-frame u. */
function warpAt(bu: number): [number, number] {
  if (bu <= WARP_FROM) return [0, 0];
  const t = Math.min(1, (bu - WARP_FROM) / (WARP_PIN.bu - WARP_FROM));
  return [t * WARP_PIN.du, t * WARP_PIN.dv];
}

/** Island frame (u, v meters) → [lng, lat]. */
export function uvToLngLat(u: number, v: number): [number, number] {
  // Invert u = bu + warp(bu) (monotonic in bu): bisection.
  let lo = u - 4000;
  let hi = u + 4000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mid + warpAt(mid)[0] < u) lo = mid; else hi = mid;
  }
  const bu = (lo + hi) / 2;
  return rawToLngLat(bu, v - warpAt(bu)[1]);
}

/** [lng, lat] → island frame (u, v meters). */
export function lngLatToUv(p: [number, number]): [number, number] {
  const [bu, bv] = rawToUv(p);
  const [du, dv] = warpAt(bu);
  return [bu + du, bv + dv];
}

/** Whether a feature is open in a given year (unknown years count as open). */
export function placeOpenIn(f: PlaceFeature, year: number): boolean {
  const { opened, closed } = f.properties;
  return (opened === undefined || opened <= year) && (closed === undefined || closed >= year);
}

/** The occupants standing in a year: per building, the latest one that has opened. */
export function placesIn(year: number, list: PlaceFeature[] = PLACES): PlaceFeature[] {
  const best = new Map<string, PlaceFeature>();
  for (const f of list) {
    if (!placeOpenIn(f, year)) continue;
    const cur = best.get(f.properties.building);
    if (!cur || (f.properties.opened ?? 0) > (cur.properties.opened ?? 0)) best.set(f.properties.building, f);
  }
  return list.filter((f) => best.get(f.properties.building) === f);
}

/** A correction made in the editor: where the building stands, how it turns, how big it is. */
export interface PlaceEdit { coordinates?: [number, number]; rotation?: number; footprint?: { w: number; d: number } }

/** The features with the editor's corrections applied. */
export function applyPlaceEdits(edits: Record<string, PlaceEdit>, list: PlaceFeature[] = PLACES): PlaceFeature[] {
  return list.map((f) => {
    const e = edits[f.id];
    if (!e) return f;
    return {
      ...f,
      geometry: { type: 'Point', coordinates: e.coordinates ?? f.geometry.coordinates },
      properties: { ...f.properties, rotation: e.rotation ?? f.properties.rotation, footprint: e.footprint ?? f.properties.footprint },
    };
  });
}

/** The corrected layer as a GeoJSON FeatureCollection (for "Copy corrections"). */
export function placesGeoJson(list: PlaceFeature[]): { type: 'FeatureCollection'; features: PlaceFeature[] } {
  return { type: 'FeatureCollection', features: list };
}
