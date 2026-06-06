// Live tournament results — the FootyHub engine writes this (from Sofascore) as the
// Mundial plays out. The site fills standings + the knockout bracket from it
// automatically; empty = not started yet (shows draw order + placeholder slots).
//
// Shape:
//   standings: { "A": [ {code,name,p,w,d,l,gf,ga,gd,pts}, … in table order ], … }
//   ko:        { "74": { home:{code,name,score}, away:{code,name,score}, status, winner }, … }
//
// (results can also arrive live via live.json.results — the site merges either source.)
window.RESULTS = { updated: null, standings: {}, ko: {} };
