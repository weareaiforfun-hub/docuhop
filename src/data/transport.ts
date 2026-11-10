/**
 * Ways to get between IDFA's cinemas, for the "Getting around" map layer. Most venues are in the centre, a walk apart;
 * these help for the ones that aren't: Eye and Pathé Noord across the IJ, The Pulse and Rialto VU at Zuidas, Rialto
 * SILO on Zeeburgereiland, De Vlugt and Podium Mozaïek in the west. Public transport facts are GVB's, not IDFA's;
 * stop positions are approximate. Stops sit at a venue (`museumId`, the venue id) or at a fixed point.
 */
export type TransportStop = { name: string; museumId?: string; at?: [number, number]; events?: string[] };
export type TransportMode = {
  id: string; name: string; short: string; color: string; summary: string; note?: string; url: string;
  stops: TransportStop[]; lines?: [number, number][]; dashed?: boolean; on: boolean;
};

export const SOURCE = "https://www.gvb.nl/en";

export const MODES: TransportMode[] = [
  {
    id: "ferry", name: "GVB ferry · free", short: "F", color: "#4fc3d9", on: true, url: SOURCE, dashed: true,
    summary: "Centraal Station (IJ side) ↔ Buiksloterweg runs day and night, every few minutes, free. Eye is a two-minute walk from the Buiksloterweg pier.",
    note: "Walking times to Eye include the crossing plus a few minutes' wait.",
    stops: [
      { name: "Centraal Station (IJ side)", at: [52.3809, 4.8996] },
      { name: "Buiksloterweg", at: [52.3838, 4.9013] },
      { name: "Eye Filmmuseum", museumId: "eye" },
    ],
    lines: [[0, 1]],
  },
  {
    id: "metro", name: "Metro 52 (Noord/Zuid)", short: "M", color: "#f5a623", on: true, url: SOURCE,
    summary: "Noord (next to Pathé Noord) · Centraal · Rokin (Tuschinski, Brakke Grond) · Vijzelgracht · De Pijp (Rialto De Pijp) · Zuid (The Pulse, Rialto VU by tram or a walk).",
    note: "A GVB ticket or contactless card is needed. Stop positions are approximate.",
    stops: [
      { name: "Noord", at: [52.4013, 4.9339] },
      { name: "Noorderpark", at: [52.3905, 4.9215] },
      { name: "Centraal Station", at: [52.3784, 4.9009] },
      { name: "Rokin", at: [52.3695, 4.8925] },
      { name: "Vijzelgracht", at: [52.3600, 4.8920] },
      { name: "De Pijp", at: [52.3545, 4.8946] },
      { name: "Europaplein", at: [52.3433, 4.8946] },
      { name: "Station Zuid", at: [52.3389, 4.8730] },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
  },
  {
    id: "tram26", name: "Tram 26 to Zeeburgereiland", short: "26", color: "#c97cf0", on: false, url: SOURCE,
    summary: "From Centraal Station east along the IJ to Zeeburgereiland, for Rialto SILO. Get off at Zuiderzeeweg.",
    note: "Stop positions are approximate.",
    stops: [
      { name: "Centraal Station", at: [52.3778, 4.9035] },
      { name: "Zuiderzeeweg", at: [52.3716, 4.9622] },
      { name: "Rialto SILO", museumId: "rialto-silo" },
    ],
    lines: [[0, 1]],
  },
  {
    id: "bike", name: "By bike", short: "B", color: "#7fd38a", on: false, url: SOURCE,
    summary: "The quickest way between far-apart cinemas: Tuschinski to The Pulse is about 20 minutes by bike, over an hour on foot. The ferries take bikes.",
    stops: [],
  },
];
