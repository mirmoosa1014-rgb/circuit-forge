# Measured engine benchmarks

100 vectors per trial; 2 warmups; 9 measured trials; medians and p95; engine only. Chained and seeded branched DAGs with differing fan-out, high/low input switching. Reference evaluation includes its deliberately simple hierarchy-copy and recursive traversal. Compiled evaluation reuses one netlist. No rendering/network time or cross-machine claim. All output values checked before timing. No timeouts or failed cases in this bounded run.

Environment: {"node":"v24.18.0","platform":"darwin","cpu":"Apple M4"}

```json
[
  {
    "size": 32,
    "scenario": "chain/high",
    "compile_ms": 0.2038750000000107,
    "compiled_ms_per_100": 0.8421659999999918,
    "reference_ms_per_100": 6.1590419999999995,
    "compiled_evaluations_per_second": 118741.43577394597,
    "reference_evaluations_per_second": 16236.291293353741,
    "p95": {
      "compile_ms": 0.2750419999999849,
      "compiled_ms_per_100": 0.9175419999999974,
      "reference_ms_per_100": 6.909999999999997
    }
  },
  {
    "size": 32,
    "scenario": "chain/low",
    "compile_ms": 0.13229200000000674,
    "compiled_ms_per_100": 0.7690000000000055,
    "reference_ms_per_100": 6.113584000000003,
    "compiled_evaluations_per_second": 130039.01170351013,
    "reference_evaluations_per_second": 16357.017422186389,
    "p95": {
      "compile_ms": 0.20179100000001426,
      "compiled_ms_per_100": 0.8770839999999964,
      "reference_ms_per_100": 6.518416000000002
    }
  },
  {
    "size": 32,
    "scenario": "branched/high",
    "compile_ms": 0.10958299999998644,
    "compiled_ms_per_100": 0.7554999999999836,
    "reference_ms_per_100": 6.160374999999988,
    "compiled_evaluations_per_second": 132362.67372601214,
    "reference_evaluations_per_second": 16232.778037051348,
    "p95": {
      "compile_ms": 0.17104100000000244,
      "compiled_ms_per_100": 0.8060419999999908,
      "reference_ms_per_100": 6.480374999999981
    }
  },
  {
    "size": 32,
    "scenario": "branched/low",
    "compile_ms": 0.101791999999989,
    "compiled_ms_per_100": 0.749416999999994,
    "reference_ms_per_100": 6.046416000000022,
    "compiled_evaluations_per_second": 133437.05840673592,
    "reference_evaluations_per_second": 16538.723104728426,
    "p95": {
      "compile_ms": 0.12774999999999181,
      "compiled_ms_per_100": 0.7955419999999549,
      "reference_ms_per_100": 6.6454160000000115
    }
  },
  {
    "size": 64,
    "scenario": "chain/high",
    "compile_ms": 0.204291000000012,
    "compiled_ms_per_100": 1.442083000000025,
    "reference_ms_per_100": 13.390791000000036,
    "compiled_evaluations_per_second": 69344.13622516753,
    "reference_evaluations_per_second": 7467.818741999613,
    "p95": {
      "compile_ms": 0.273290999999972,
      "compiled_ms_per_100": 1.5948750000000018,
      "reference_ms_per_100": 14.033542000000011
    }
  },
  {
    "size": 64,
    "scenario": "chain/low",
    "compile_ms": 0.2168330000000651,
    "compiled_ms_per_100": 1.464207999999985,
    "reference_ms_per_100": 13.720916999999986,
    "compiled_evaluations_per_second": 68296.30762842507,
    "reference_evaluations_per_second": 7288.142621954502,
    "p95": {
      "compile_ms": 0.3323329999999487,
      "compiled_ms_per_100": 1.6810410000000502,
      "reference_ms_per_100": 14.561125000000061
    }
  },
  {
    "size": 64,
    "scenario": "branched/high",
    "compile_ms": 0.21012499999994816,
    "compiled_ms_per_100": 1.472250000000031,
    "reference_ms_per_100": 13.529749999999922,
    "compiled_evaluations_per_second": 67923.24673119232,
    "reference_evaluations_per_second": 7391.119569836884,
    "p95": {
      "compile_ms": 0.23974999999995816,
      "compiled_ms_per_100": 1.55762500000003,
      "reference_ms_per_100": 13.878833999999983
    }
  },
  {
    "size": 64,
    "scenario": "branched/low",
    "compile_ms": 0.209041999999954,
    "compiled_ms_per_100": 1.4730409999999665,
    "reference_ms_per_100": 13.496708000000126,
    "compiled_evaluations_per_second": 67886.77300903524,
    "reference_evaluations_per_second": 7409.214158000534,
    "p95": {
      "compile_ms": 0.2284589999999298,
      "compiled_ms_per_100": 1.6529160000000047,
      "reference_ms_per_100": 13.93379200000004
    }
  },
  {
    "size": 128,
    "scenario": "chain/high",
    "compile_ms": 0.37475000000017644,
    "compiled_ms_per_100": 2.939583000000084,
    "reference_ms_per_100": 30.92583300000001,
    "compiled_evaluations_per_second": 34018.43050527818,
    "reference_evaluations_per_second": 3233.5426502497107,
    "p95": {
      "compile_ms": 0.41908300000000054,
      "compiled_ms_per_100": 3.551584000000048,
      "reference_ms_per_100": 31.126541999999972
    }
  },
  {
    "size": 128,
    "scenario": "chain/low",
    "compile_ms": 0.36912499999994,
    "compiled_ms_per_100": 2.9780000000000655,
    "reference_ms_per_100": 30.87779099999989,
    "compiled_evaluations_per_second": 33579.58361316246,
    "reference_evaluations_per_second": 3238.573640193379,
    "p95": {
      "compile_ms": 0.5140000000001237,
      "compiled_ms_per_100": 3.191000000000031,
      "reference_ms_per_100": 31.23700000000008
    }
  },
  {
    "size": 128,
    "scenario": "branched/high",
    "compile_ms": 0.3745410000001357,
    "compiled_ms_per_100": 2.9312920000002123,
    "reference_ms_per_100": 30.627332999999908,
    "compiled_evaluations_per_second": 34114.64978582576,
    "reference_evaluations_per_second": 3265.0573917095653,
    "p95": {
      "compile_ms": 0.3856670000000122,
      "compiled_ms_per_100": 3.0278330000001006,
      "reference_ms_per_100": 31.46716600000036
    }
  },
  {
    "size": 128,
    "scenario": "branched/low",
    "compile_ms": 0.3791670000000522,
    "compiled_ms_per_100": 3.017166999999972,
    "reference_ms_per_100": 30.49087499999996,
    "compiled_evaluations_per_second": 33143.674181774135,
    "reference_evaluations_per_second": 3279.6697372574627,
    "p95": {
      "compile_ms": 0.6380840000001626,
      "compiled_ms_per_100": 3.3577500000001237,
      "reference_ms_per_100": 30.952166999999918
    }
  },
  {
    "size": 256,
    "scenario": "chain/high",
    "compile_ms": 0.6750000000001819,
    "compiled_ms_per_100": 5.822375000000193,
    "reference_ms_per_100": 85.31620800000019,
    "compiled_evaluations_per_second": 17175.121836019956,
    "reference_evaluations_per_second": 1172.1102278713533,
    "p95": {
      "compile_ms": 0.8515840000000026,
      "compiled_ms_per_100": 6.34820899999977,
      "reference_ms_per_100": 103.1818330000001
    }
  },
  {
    "size": 256,
    "scenario": "chain/low",
    "compile_ms": 0.6462089999995442,
    "compiled_ms_per_100": 5.633375000000342,
    "reference_ms_per_100": 83.86970900000051,
    "compiled_evaluations_per_second": 17751.34799298714,
    "reference_evaluations_per_second": 1192.3255868218093,
    "p95": {
      "compile_ms": 0.9475830000001224,
      "compiled_ms_per_100": 5.771875000000364,
      "reference_ms_per_100": 88.0272500000001
    }
  },
  {
    "size": 256,
    "scenario": "branched/high",
    "compile_ms": 0.6663330000001224,
    "compiled_ms_per_100": 5.6409169999997175,
    "reference_ms_per_100": 83.67395800000031,
    "compiled_evaluations_per_second": 17727.614145006035,
    "reference_evaluations_per_second": 1195.1149723310523,
    "p95": {
      "compile_ms": 0.7811670000000959,
      "compiled_ms_per_100": 7.233374999999796,
      "reference_ms_per_100": 85.85845800000061
    }
  },
  {
    "size": 256,
    "scenario": "branched/low",
    "compile_ms": 0.6957919999995283,
    "compiled_ms_per_100": 5.722584000000097,
    "reference_ms_per_100": 88.18174999999974,
    "compiled_evaluations_per_second": 17474.623351967974,
    "reference_evaluations_per_second": 1134.0214953774482,
    "p95": {
      "compile_ms": 1.0252500000005966,
      "compiled_ms_per_100": 6.688958000000639,
      "reference_ms_per_100": 102.26262499999939
    }
  }
]
```

Raw trial samples are in results/benchmark.json. These synthetic DAGs are narrow workloads, not a general performance claim. Structural counts are not physical area, power or delay.
