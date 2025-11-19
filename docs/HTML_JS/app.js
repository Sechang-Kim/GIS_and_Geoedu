// app.js

const DATA_URL = "data/weather_by_region.json";

let map;
let baseLayers = {};
let climateTable;
let currentRegion = null;
let markersByName = {};
let selectedRegionForDim = null; // 표에서 선택해 흐릿 처리한 지역

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initBasemapSwitch();
  loadData();

  // 드롭다운 변경 → 표 다시
  document.getElementById("metric-select").addEventListener("change", () => {
    if (window.__CLIMATE_DATA__) {
      rebuildTable(window.__CLIMATE_DATA__);
    }
  });
});

// 지도 초기화
function initMap() {
  map = L.map("map").setView([35.65, 129], 7);

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  const cartoVoyager = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    { attribution: "&copy; CARTO" }
  );

  const cartoPositron = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    { attribution: "&copy; CARTO" }
  );

  baseLayers = {
    osm,
    "carto-voyager": cartoVoyager,
    "carto-positron": cartoPositron
  };

  // 팝업이 실제로 붙었을 때만 차트 렌더
  map.on("popupopen", (e) => {
    const popupEl = e.popup.getElement();
    if (!popupEl) return;
    const chartEl = popupEl.querySelector("#popup-chart");
    const region = popupEl.querySelector(".popup-chart-wrap")?.dataset?.region;
    if (!chartEl || !region) return;

    chartEl.style.width = "100%";
    chartEl.style.height = "190px";

    drawChartDirect(region, chartEl);
    highlightTableRow(region);
    currentRegion = region;
  });
}

// 베이스맵 전환
function initBasemapSwitch() {
  const buttons = document.querySelectorAll(".basemap-switch button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.layer;
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      Object.values(baseLayers).forEach((lyr) => {
        if (map.hasLayer(lyr)) map.removeLayer(lyr);
      });
      baseLayers[key].addTo(map);
    });
  });
}

// 데이터 로드
async function loadData() {
  const res = await fetch(DATA_URL);
  const data = await res.json();

  window.__CLIMATE_DATA__ = data;

  const names = Object.keys(data);
  if (names.length > 0) currentRegion = names[0];

  putMarkersFromJson(data);
  rebuildTable(data);
}

// 마커 올리기
function putMarkersFromJson(jsonData) {
  Object.entries(jsonData).forEach(([name, obj]) => {
    const coord = obj.coord;
    if (!coord) return;

    const html = `
      <div class="popup-chart-wrap" data-region="${name}">
        <div class="popup-chart-title">${name} 기후 (월별)</div>
        <div id="popup-chart"></div>
      </div>
    `;

    const opts = {};
    if (obj.icon) {
      opts.icon = L.icon({
        iconUrl: obj.icon,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });
    }

    const marker = L.marker([coord[0], coord[1]], opts)
      .addTo(map)
      .bindPopup(html, { maxWidth: 380 });

    markersByName[name] = marker;
  });
}

// 테이블 만들기 / 다시 만들기
function rebuildTable(jsonData) {
  const metric = document.getElementById("metric-select").value;
  const tbody = document.querySelector("#climate-table tbody");

  if (climateTable) {
    climateTable.destroy();
  }
  tbody.innerHTML = "";

  Object.entries(jsonData).forEach(([name, obj]) => {
    const monthly =
      metric === "temp"
        ? obj.series?.temp?.monthly || []
        : obj.series?.precip?.monthly || [];

    const tr = document.createElement("tr");
    tr.dataset.region = name;

    let tds = `<td>${name}</td>`;
    for (let i = 0; i < 12; i++) {
      const v = monthly[i] != null ? monthly[i] : "";
      tds += `<td>${v}</td>`;
    }
    tr.innerHTML = tds;
    tbody.appendChild(tr);
  });

  climateTable = new DataTable("#climate-table", {
    paging: true,
    pageLength: 10,
    searching: false,
    info: false,
    scrollX: true
  });

  document
    .querySelector("#climate-table tbody")
    .addEventListener("click", onTableRowClick);
}

// 표 클릭 → 마커만 강조/토글
function onTableRowClick(e) {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const region = tr.dataset.region;
  if (!region) return;

  // 다시 클릭하면 원복
  if (selectedRegionForDim === region) {
    selectedRegionForDim = null;
    highlightTableRow(null);
    resetMarkerDim();
    return;
  }

  selectedRegionForDim = region;
  highlightTableRow(region);
  dimExcept(region);
}

// 선택한 것만 진하게
function dimExcept(regionName) {
  Object.entries(markersByName).forEach(([name, marker]) => {
    const el = marker._icon;
    if (!el) return;
    if (name === regionName) {
      el.classList.remove("dimmed-marker");
    } else {
      el.classList.add("dimmed-marker");
    }
  });
}

// 전체 원복
function resetMarkerDim() {
  Object.values(markersByName).forEach((marker) => {
    const el = marker._icon;
    if (!el) return;
    el.classList.remove("dimmed-marker");
  });
}

// 팝업 차트 그리기
function drawChartDirect(regionName, dom) {
  const all = window.__CLIMATE_DATA__;
  if (!all) return;

  const series = getRegionSeries(all, regionName);
  const option = buildChartOption(series, regionName);

  let chart = echarts.getInstanceByDom(dom);
  if (!chart) {
    chart = echarts.init(dom);
  }
  chart.setOption(option, true);
  setTimeout(() => chart.resize(), 30);
}

// 데이터 → 시리즈
function getRegionSeries(allData, regionName) {
  const region = allData[regionName];
  if (!region) return { months: [], temp: [], precip: [] };
  return {
    months: ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"],
    temp: region.series?.temp?.monthly || [],
    precip: region.series?.precip?.monthly || []
  };
}

// ECharts 옵션
function buildChartOption(series, regionName) {
  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, data: ["평균 기온 (℃)", "강수량 (㎜)"] },
    grid: { left: 40, right: 40, top: 25, bottom: 45 },
    xAxis: {
      type: "category",
      data: series.months,
      axisLabel: { fontSize: 10 }
    },
    yAxis: [
      { type: "value", name: "℃", min: -15, max: 35 },
      { type: "value", name: "mm", min: 0, max: 500, position: "right" }
    ],
    series: [
      {
        name: "평균 기온 (℃)",
        type: "line",
        yAxisIndex: 0,
        data: series.temp,
        smooth: true,
        symbolSize: 4,
        lineStyle: { width: 2, color: "#EEA47F" },
        itemStyle: { color: "#EEA47F" }
      },
      {
        name: "강수량 (㎜)",
        type: "bar",
        yAxisIndex: 1,
        data: series.precip,
        barWidth: "45%",
        itemStyle: { color: "#00539C", opacity: 0.8 }
      }
    ]
  };
}

// 테이블 하이라이트
function highlightTableRow(regionName) {
  const rows = document.querySelectorAll("#climate-table tbody tr");
  rows.forEach((r) => r.classList.remove("active-row"));
  if (!regionName) return;
  rows.forEach((r) => {
    if (r.dataset.region === regionName) {
      r.classList.add("active-row");
    }
  });
}
