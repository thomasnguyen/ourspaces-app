import { useEffect, useState, type CSSProperties } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { PollWidget } from "../widgets/core";
import { LetterWidget } from "../widgets/extras";
import { getSpace } from "../data/spaces";
import { getDataMode } from "../live/dataMode";
import { lastSpaceSlug, normalSpaceHash } from "../lib/routes";

const REPO_URL = "https://github.com/thomasnguyen/ourspaces-app";
const CAKE_POLL = getSpace("crew").widgets.find((widget) => widget.id === "poll-cake")!;

const ROOMS = [
  { slug: "crew", label: "the friends", detail: "birthdays, big plans, inside jokes", color: "league", image: "/assets/the-crew-snapshot-thumb.jpg" },
  { slug: "couple", label: "the two of you", detail: "a little closer, even from far away", color: "couple", image: "/assets/space-covers/us-two.png" },
  { slug: "house", label: "the housemates", detail: "shared chores. shared chaos.", color: "trip", image: "/assets/space-covers/the-house.png" },
  { slug: "buildroom", label: "the builders", detail: "good links and things you made", color: "crew", symbol: "</>" },
  { slug: "league", label: "the team", detail: "game days and the post-game plans", color: "fam", image: "/assets/space-covers/game-day.png" },
];

// Original vendor artwork, embedded so logos load with the page.
// Logo names and artwork belong to their respective owners.
const VENDOR_LOGOS = {
  // https://www.convex.dev/resources/logos.zip
  convex: "<svg width=\"382\" height=\"146\" viewBox=\"0 0 382 146\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M114.794 86.6648C111.454 83.6785 109.784 79.2644 109.784 73.434C109.784 67.6036 111.487 63.1896 114.896 60.2033C118.301 57.217 122.959 55.721 128.865 55.721C131.319 55.721 133.486 55.8973 135.372 56.2613C137.258 56.6197 139.063 57.2283 140.786 58.0929V67.5524C138.106 66.2157 135.064 65.5445 131.659 65.5445C128.66 65.5445 126.445 66.1417 125.018 67.3363C123.586 68.5308 122.873 70.5615 122.873 73.434C122.873 76.2099 123.575 78.2178 124.986 79.4578C126.391 80.7035 128.617 81.3236 131.665 81.3236C134.891 81.3236 137.955 80.5329 140.862 78.9573V88.8547C137.636 90.3849 133.615 91.1471 128.801 91.1471C122.797 91.1471 118.133 89.6511 114.794 86.6648Z\" fill=\"white\"/>\n<path d=\"M143.77 73.4279C143.77 67.643 145.337 63.246 148.471 60.2312C151.605 57.2165 156.328 55.7148 162.645 55.7148C169.006 55.7148 173.761 57.2222 176.922 60.2312C180.078 63.2403 181.656 67.643 181.656 73.4279C181.656 85.2366 175.318 91.1409 162.645 91.1409C150.06 91.1466 143.77 85.2423 143.77 73.4279ZM167.179 79.4574C168.109 78.2116 168.574 76.2037 168.574 73.4335C168.574 70.7089 168.109 68.7123 167.179 67.4439C166.25 66.1754 164.737 65.544 162.645 65.544C160.603 65.544 159.122 66.1811 158.214 67.4439C157.306 68.7123 156.853 70.7089 156.853 73.4335C156.853 76.2094 157.306 78.2173 158.214 79.4574C159.122 80.7031 160.597 81.3231 162.645 81.3231C164.737 81.3231 166.244 80.6974 167.179 79.4574Z\" fill=\"white\"/>\n<path d=\"M184.638 56.4315H196.629L196.97 59.014C198.288 58.0583 199.969 57.2677 202.011 56.6477C204.054 56.0276 206.167 55.7148 208.35 55.7148C212.392 55.7148 215.343 56.7671 217.207 58.8718C219.071 60.9764 220.001 64.2244 220.001 68.627V90.4299H207.194V69.9865C207.194 68.4564 206.864 67.3585 206.205 66.6873C205.546 66.0161 204.443 65.6862 202.898 65.6862C201.947 65.6862 200.968 65.9137 199.969 66.3688C198.969 66.8239 198.131 67.4097 197.445 68.1265V90.4299H184.638V56.4315Z\" fill=\"white\"/>\n<path d=\"M220.038 56.4317H233.391L239.524 76.3689L245.658 56.4317H259.011L246.268 90.4301H232.775L220.038 56.4317Z\" fill=\"white\"/>\n<path d=\"M263.043 87.5062C259.195 84.4687 257.396 79.1957 257.396 73.5018C257.396 67.9558 258.828 63.3882 262.097 60.2312C265.366 57.0743 270.349 55.7148 276.639 55.7148C282.426 55.7148 286.976 57.1255 290.3 59.9468C293.618 62.7682 295.282 66.6191 295.282 71.4939V77.4494H270.927C271.532 79.2184 272.299 80.4983 274.185 81.289C276.071 82.0796 278.703 82.4721 282.07 82.4721C284.08 82.4721 286.133 82.3071 288.219 81.9715C288.954 81.8521 290.165 81.6644 290.802 81.5222V89.7871C287.619 90.6972 283.377 91.1523 278.595 91.1523C272.159 91.1466 266.89 90.5437 263.043 87.5062ZM281.826 70.1344C281.826 68.4507 279.984 64.8273 276.282 64.8273C272.942 64.8273 270.738 68.3938 270.738 70.1344H281.826Z\" fill=\"white\"/>\n<path d=\"M305.338 73.1437L293.346 56.4317H307.245L331.773 90.4301H317.74L312.287 82.825L306.835 90.4301H292.865L305.338 73.1437Z\" fill=\"white\"/>\n<path d=\"M317.431 56.4317H331.265L320.647 71.3178L313.622 61.7786L317.431 56.4317Z\" fill=\"white\"/>\n<path d=\"M82.2808 87.6517C89.652 86.8381 96.6012 82.9353 100.427 76.4211C98.6156 92.533 80.8853 102.717 66.413 96.4643C65.0795 95.8897 63.9316 94.9339 63.1438 93.705C59.8915 88.6302 58.8224 82.1729 60.3585 76.313C64.7475 83.8399 73.6717 88.4538 82.2808 87.6517Z\" fill=\"white\"/>\n<path d=\"M60.0895 71.5852C57.1016 78.4464 56.9722 86.4797 60.6353 93.0906C47.7442 83.453 47.8848 62.8294 60.4778 53.2885C61.6425 52.4067 63.0267 51.8833 64.4785 51.8036C70.4486 51.4907 76.5144 53.7835 80.7683 58.0561C72.1254 58.1415 63.7076 63.643 60.0895 71.5852Z\" fill=\"white\"/>\n<path d=\"M84.9366 60.1673C80.5757 54.1253 73.7503 50.0119 66.2722 49.8868C80.7277 43.3669 98.5086 53.9375 100.444 69.5659C100.624 71.0167 100.388 72.4959 99.7409 73.8044C97.04 79.2547 92.032 83.4819 86.1801 85.0464C90.4678 77.144 89.9388 67.4893 84.9366 60.1673Z\" fill=\"white\"/>\n</svg>",
  // https://cdn.openai.com/brand/OpenAI-Logos-2025.zip
  openai: "<svg width=\"1604\" height=\"719\" viewBox=\"0 0 1604 719\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<g clip-path=\"url(#clip0_1637_3573)\">\n<path d=\"M358.8 240.1C293.02 240.1 239.2 293.92 239.2 359.7C239.2 425.48 293.02 479.3 358.8 479.3C424.58 479.3 478.4 425.812 478.4 359.7C478.4 293.587 424.912 240.1 358.8 240.1ZM358.8 436.443C317.937 436.443 285.046 402.889 285.046 359.7C285.046 316.511 317.937 282.956 358.8 282.956C399.663 282.956 432.553 316.511 432.553 359.7C432.553 402.889 399.663 436.443 358.8 436.443Z\" fill=\"white\"/>\n<path d=\"M599.326 306.544C577.732 306.544 556.802 315.182 545.838 329.8V309.866H502.649V542.422H545.838V458.37C556.802 471.991 577.067 479.3 599.326 479.3C645.837 479.3 682.382 442.755 682.382 392.922C682.382 343.089 645.837 306.544 599.326 306.544ZM592.017 441.759C567.433 441.759 545.506 422.49 545.506 392.922C545.506 363.354 567.433 344.085 592.017 344.085C616.602 344.085 638.528 363.354 638.528 392.922C638.528 422.49 616.602 441.759 592.017 441.759Z\" fill=\"white\"/>\n<path d=\"M784.046 306.544C736.871 306.544 699.662 343.421 699.662 392.922C699.662 442.423 732.22 479.3 785.375 479.3C828.896 479.3 856.803 453.054 865.441 423.486H823.249C817.933 435.779 802.983 444.416 785.043 444.416C762.784 444.416 745.841 428.802 741.854 406.543H867.434V389.6C867.434 344.417 835.873 306.544 784.046 306.544ZM742.186 375.979C746.838 355.049 764.113 341.428 785.043 341.428C807.302 341.428 824.245 356.045 826.239 375.979H742.186Z\" fill=\"white\"/>\n<path d=\"M982.38 306.544C963.111 306.544 942.845 315.182 933.543 329.468V309.866H890.354V475.978H933.543V386.61C933.543 360.696 947.496 343.753 970.087 343.753C991.017 343.753 1002.31 359.7 1002.31 381.959V475.978H1045.5V374.982C1045.5 333.786 1020.25 306.544 982.38 306.544Z\" fill=\"white\"/>\n<path d=\"M1156.12 243.428L1062.1 475.984H1108.28L1128.21 425.154H1235.19L1255.12 475.984H1301.96L1208.61 243.428H1156.12ZM1143.16 386.616L1181.7 289.275L1219.9 386.616H1143.16Z\" fill=\"white\"/>\n<path d=\"M1363.42 243.428H1319.57V475.984H1363.42V243.428Z\" fill=\"white\"/>\n</g>\n<defs>\n<clipPath id=\"clip0_1637_3573\">\n<rect width=\"1603.2\" height=\"717.6\" fill=\"white\" transform=\"translate(0 0.899902)\"/>\n</clipPath>\n</defs>\n</svg>",
  // https://www.agentmail.to/
  agentmail: "<svg color=\"white\" viewBox=\"0 0 1986 363\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M318.029 88.3407C196.474 115.33 153.48 115.321 33.9244 88.3271C30.6216 87.5814 27.1432 88.9727 25.3284 91.8313L1.24109 129.774C-1.76483 134.509 0.965276 140.798 6.46483 141.898C152.613 171.13 197.678 171.182 343.903 141.835C349.304 140.751 352.064 134.641 349.247 129.907L326.719 92.0479C324.95 89.0744 321.407 87.5907 318.029 88.3407Z\" fill=\"currentColor\"></path><path d=\"M75.9931 246.6L149.939 311.655C151.973 313.444 151.633 316.969 149.281 318.48L119.141 337.84C117.283 339.034 114.951 338.412 113.933 336.452L70.1276 252.036C68.0779 248.086 72.7553 243.751 75.9931 246.6Z\" fill=\"currentColor\"></path><path d=\"M274.025 246.6L200.08 311.655C198.046 313.444 198.385 316.969 200.737 318.48L230.877 337.84C232.736 339.034 235.068 338.412 236.085 336.452L279.891 252.036C281.941 248.086 277.263 243.751 274.025 246.6Z\" fill=\"currentColor\"></path><path d=\"M138.75 198.472L152.436 192.983C155.238 191.918 157.77 191.918 158.574 191.918C164.115 192.126 169.564 192.232 175.009 192.235C180.454 192.232 185.904 192.126 191.444 191.918C192.248 191.918 194.78 191.918 197.583 192.983L211.269 198.472C212.645 199.025 214.082 199.382 215.544 199.448C218.585 199.587 221.733 199.464 224.63 198.811C225.706 198.568 226.728 198.103 227.704 197.545L243.046 188.784C244.81 187.777 246.726 187.138 248.697 186.9L258.276 185.5H259.242H263.556L262.713 190.965L256.679 234.22C255.957 238.31 254.25 242.328 250.443 245.834L187.376 299.258C184.555 301.648 181.107 302.942 177.562 302.942H175.009H172.457C168.911 302.942 165.464 301.648 162.643 299.258L99.5761 245.834C95.7684 242.328 94.0614 238.31 93.3393 234.22L87.3059 190.965L86.4624 185.5H90.7771H91.7429L101.322 186.9C103.293 187.138 105.208 187.777 106.972 188.784L122.314 197.545C123.291 198.103 124.313 198.568 125.389 198.811C128.286 199.464 131.434 199.587 134.474 199.448C135.936 199.382 137.373 199.025 138.75 198.472Z\" fill=\"currentColor\"></path><path d=\"M102.47 0.847827C205.434 44.796 156.456 42.1015 248.434 1.63153C252.885 -1.09955 258.353 1.88915 259.419 7.69219L269.235 61.1686L270.819 69.7893L263.592 71.8231L263.582 71.8259C190.588 92.3069 165.244 92.0078 86.7576 71.7428L79.1971 69.7905L80.9925 60.8681L91.8401 6.91975C92.9559 1.3706 98.105 -1.55777 102.47 0.847827Z\" fill=\"currentColor\"></path><path d=\"M453.143 292L540.424 47.5469H594.893L681.846 292H634.104L614.58 233.594H519.752L499.736 292H453.143ZM531.893 197.992H602.768L591.283 163.539C587.674 152.273 583.955 140.516 580.127 128.266C576.408 116.016 572.252 102.18 567.658 86.7578C563.064 102.18 558.854 116.016 555.025 128.266C551.197 140.516 547.424 152.273 543.705 163.539L531.893 197.992Z\" fill=\"currentColor\"></path><path d=\"M773.721 362.875C750.861 362.875 732.705 357.953 719.252 348.109C705.799 338.266 697.924 324.922 695.627 308.078H736.15C738.119 315.516 742.439 321.148 749.111 324.977C755.783 328.914 763.986 330.883 773.721 330.883C786.627 330.883 796.635 327.383 803.744 320.383C810.963 313.383 814.572 303.266 814.572 290.031V263.617H814.408C808.83 273.789 801.557 281.281 792.588 286.094C783.619 290.797 773.447 293.148 762.072 293.148C746.979 293.148 733.799 289.375 722.533 281.828C711.268 274.281 702.518 263.891 696.283 250.656C690.158 237.312 687.096 221.945 687.096 204.555C687.096 187.055 690.213 171.578 696.447 158.125C702.682 144.672 711.432 134.172 722.697 126.625C733.963 119.078 746.979 115.305 761.744 115.305C773.01 115.305 783.182 117.711 792.26 122.523C801.447 127.227 808.885 134.555 814.572 144.508H814.736V118.75H855.588V287.57C855.588 305.398 852.033 319.836 844.924 330.883C837.814 342.039 828.08 350.133 815.721 355.164C803.361 360.305 789.361 362.875 773.721 362.875ZM771.752 259.023C785.314 259.023 796.143 254.047 804.236 244.094C812.439 234.031 816.541 220.688 816.541 204.062C816.541 187.438 812.439 174.148 804.236 164.195C796.143 154.133 785.314 149.102 771.752 149.102C758.955 149.102 748.619 153.859 740.744 163.375C732.869 172.891 728.932 186.453 728.932 204.062C728.932 221.781 732.869 235.398 740.744 244.914C748.619 254.32 758.955 259.023 771.752 259.023Z\" fill=\"currentColor\"></path><path d=\"M968.791 295.938C951.51 295.938 936.525 292.055 923.838 284.289C911.15 276.523 901.361 265.859 894.471 252.297C887.689 238.625 884.299 223.039 884.299 205.539C884.299 187.93 887.799 172.344 894.799 158.781C901.908 145.109 911.697 134.391 924.166 126.625C936.635 118.75 950.963 114.812 967.15 114.812C983.775 114.812 998.322 118.641 1010.79 126.297C1023.26 133.953 1032.94 144.562 1039.83 158.125C1046.72 171.578 1050.17 187.164 1050.17 204.883V216.203H924.822C925.369 230.312 929.525 241.688 937.291 250.328C945.057 258.969 955.885 263.289 969.775 263.289C980.166 263.289 988.752 261.047 995.533 256.562C1002.31 251.969 1006.91 245.953 1009.31 238.516H1048.03C1045.85 249.781 1041.03 259.734 1033.6 268.375C1026.27 277.016 1017.03 283.797 1005.87 288.719C994.713 293.531 982.354 295.938 968.791 295.938ZM925.15 187.656H1010.46C1009.15 175.297 1004.67 165.562 997.01 158.453C989.463 151.234 979.729 147.625 967.807 147.625C955.775 147.625 945.986 151.234 938.439 158.453C931.002 165.562 926.572 175.297 925.15 187.656Z\" fill=\"currentColor\"></path><path d=\"M1119.73 194.055V292H1078.38V118.75H1119.07V145.328C1131.1 125.312 1148.82 115.305 1172.23 115.305C1190.38 115.305 1205.21 121.156 1216.69 132.859C1228.28 144.562 1234.08 161.516 1234.08 183.719V292H1192.57V190.281C1192.57 177.594 1189.51 167.969 1183.38 161.406C1177.26 154.844 1168.67 151.562 1157.63 151.562C1146.8 151.562 1137.78 154.953 1130.56 161.734C1123.34 168.516 1119.73 179.289 1119.73 194.055Z\" fill=\"currentColor\"></path><path d=\"M1362.38 118.75V152.055H1327.1V242.289C1327.1 248.523 1328.36 252.844 1330.88 255.25C1333.39 257.547 1337.99 258.695 1344.66 258.695H1362.38V292H1337.44C1319.83 292 1306.76 288.445 1298.23 281.336C1289.81 274.227 1285.6 263.234 1285.6 248.359V152.055H1255.41V118.75H1285.6V71.5H1327.1V118.75H1362.38Z\" fill=\"currentColor\"></path><path d=\"M1390.43 292V47.5469H1452.78L1500.35 176.008C1502.65 182.789 1505.55 191.648 1509.05 202.586C1512.55 213.414 1515.72 223.586 1518.56 233.102C1521.41 223.586 1524.53 213.414 1527.92 202.586C1531.42 191.648 1534.31 182.789 1536.61 176.008L1583.37 47.5469H1646.04V292H1603.38V167.312C1603.38 158.672 1603.55 148.062 1603.88 135.484C1604.21 122.906 1604.53 110.383 1604.86 97.9141C1600.49 111.695 1596.33 124.875 1592.39 137.453C1588.46 149.922 1585.17 159.875 1582.55 167.312L1535.96 292H1500.52L1453.6 167.312C1451.08 160.203 1447.85 150.742 1443.92 138.93C1440.09 127.008 1436.04 114.484 1431.78 101.359C1432.1 113.391 1432.38 125.367 1432.6 137.289C1432.92 149.102 1433.09 159.109 1433.09 167.312V292H1390.43Z\" fill=\"currentColor\"></path><path d=\"M1737.59 294.789C1720.31 294.789 1705.98 290.469 1694.6 281.828C1683.34 273.078 1677.71 260.062 1677.71 242.781C1677.71 229.656 1680.88 219.539 1687.22 212.43C1693.67 205.211 1702.04 199.961 1712.32 196.68C1722.71 193.398 1733.87 191.156 1745.79 189.953C1761.87 188.094 1773.08 186.453 1779.42 185.031C1785.77 183.609 1788.94 179.945 1788.94 174.039V172.727C1788.94 165.289 1786.1 159.219 1780.41 154.516C1774.83 149.812 1767.12 147.461 1757.28 147.461C1747.21 147.461 1739.01 149.812 1732.67 154.516C1726.43 159.219 1723.04 165.234 1722.49 172.562H1682.63C1683.61 155.391 1690.78 141.555 1704.12 131.055C1717.46 120.555 1735.46 115.305 1758.1 115.305C1780.63 115.305 1798.24 120.555 1810.92 131.055C1823.61 141.555 1829.96 155.828 1829.96 173.875V292H1789.27V267.555H1788.61C1784.46 275.211 1778.44 281.664 1770.56 286.914C1762.69 292.164 1751.7 294.789 1737.59 294.789ZM1747.76 264.109C1761.32 264.109 1771.6 260.609 1778.6 253.609C1785.6 246.5 1789.1 237.914 1789.1 227.852V209.148C1786.59 210.789 1781.72 212.32 1774.5 213.742C1767.28 215.055 1759.41 216.367 1750.88 217.68C1742.02 218.992 1734.31 221.508 1727.74 225.227C1721.29 228.836 1718.06 234.578 1718.06 242.453C1718.06 249.234 1720.74 254.539 1726.1 258.367C1731.46 262.195 1738.68 264.109 1747.76 264.109Z\" fill=\"currentColor\"></path><path d=\"M1866.54 292V118.75H1907.88V292H1866.54ZM1887.21 92.9922C1880.1 92.9922 1874.2 90.75 1869.49 86.2656C1864.79 81.6719 1862.44 76.0391 1862.44 69.3672C1862.44 62.6953 1864.79 57.1172 1869.49 52.6328C1874.2 48.1484 1880.1 45.9062 1887.21 45.9062C1894.21 45.9062 1900.06 48.1484 1904.77 52.6328C1909.47 57.1172 1911.82 62.6953 1911.82 69.3672C1911.82 76.0391 1909.47 81.6719 1904.77 86.2656C1900.06 90.75 1894.21 92.9922 1887.21 92.9922Z\" fill=\"currentColor\"></path><path d=\"M1985.98 47.5469V292H1944.63V47.5469H1985.98Z\" fill=\"currentColor\"></path></svg>",
  // https://www.firecrawl.dev/brand/firecrawl-colored-light-wordmark.svg
  firecrawl: "<svg width=\"172\" height=\"40\" viewBox=\"0 0 172 40\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M23.3606 12.8281C21.8137 13.2873 20.6476 14.3261 19.7936 15.4544C19.6102 15.6966 19.228 15.5146 19.3008 15.2178C20.936 8.49401 18.7759 2.90556 12.0422 0.154735C11.7006 0.0147436 11.345 0.321324 11.4346 0.679702C14.4977 12.9779 1.61412 11.9406 3.24224 25.8823C3.27024 26.1217 3.00145 26.2855 2.80546 26.1455C2.19509 25.7073 1.51332 24.7932 1.04575 24.1506C0.908555 23.9616 0.611769 24.0148 0.548773 24.2402C0.176391 25.5869 0 26.8553 0 28.1152C0 33.0149 2.51847 37.328 6.33048 39.8283C6.54887 39.9711 6.82886 39.7667 6.75466 39.5161C6.55867 38.8581 6.44808 38.1638 6.43968 37.4456C6.43968 37.0046 6.46768 36.5539 6.53627 36.1339C6.69587 35.0784 7.06265 34.0732 7.67862 33.1577C9.79111 29.9869 14.0259 26.9239 13.3497 22.7647C13.3063 22.5015 13.6171 22.328 13.8131 22.5085C16.7964 25.2342 17.3871 28.9005 16.8972 32.1889C16.8552 32.4745 17.2135 32.6271 17.3941 32.4031C17.8505 31.832 18.4077 31.3308 19.0138 30.9542C19.165 30.8604 19.3666 30.9318 19.424 31.0998C19.7614 32.0811 20.2626 33.0023 20.7358 33.9234C21.3013 35.0308 21.6023 36.2949 21.5547 37.6332C21.5309 38.2842 21.4231 38.9141 21.2425 39.5133C21.1655 39.7667 21.4427 39.9781 21.6653 39.8325C25.4801 37.3322 28 33.0191 28 28.1166C28 26.4129 27.7018 24.7428 27.1376 23.1777C25.9547 19.8949 22.9533 17.4297 23.712 13.1515C23.7484 12.9471 23.5594 12.7693 23.3606 12.8281Z\" fill=\"#FA5D19\" style=\"fill:#FA5D19;fill:color(display-p3 0.9816 0.3634 0.0984);fill-opacity:1;\"/>\n<path d=\"M41 34.0521V10.9618H55.7586V14.3264H44.7969V21.0226H53.8436V24.2882H44.7969V34.0521H41Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n<path d=\"M59.9569 14.7882C58.7352 14.7882 57.7777 13.8976 57.7777 12.6441C57.7777 11.3906 58.7352 10.5 59.9569 10.5C61.1785 10.5 62.136 11.3906 62.136 12.6441C62.136 13.8976 61.1785 14.7882 59.9569 14.7882ZM58.1409 34.0521V17.1632H61.7068V34.0521H58.1409Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n<path d=\"M73.5885 17.1632H74.3809V20.4948H72.796C69.6264 20.4948 68.6029 22.9687 68.6029 25.5747V34.0521H65.0371V17.1632H68.2067L68.6029 19.7031C69.4613 18.2847 70.815 17.1632 73.5885 17.1632Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n<path d=\"M83.632 34.25C78.3163 34.25 74.9816 30.8194 74.9816 25.6406C74.9816 20.4288 78.3163 16.9653 83.3019 16.9653C88.1884 16.9653 91.457 20.066 91.5561 25.0139C91.5561 25.4427 91.5231 25.9045 91.457 26.3663H78.7125V26.5972C78.8116 29.467 80.6275 31.3472 83.4339 31.3472C85.613 31.3472 87.1979 30.2587 87.6931 28.3785H91.2589C90.6646 31.7101 87.8252 34.25 83.632 34.25ZM78.8446 23.7604H87.8582C87.561 21.2535 85.8112 19.8351 83.3349 19.8351C81.0567 19.8351 79.1087 21.3524 78.8446 23.7604Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n<path d=\"M102.033 34.25C96.9151 34.25 93.6465 30.9184 93.6465 25.6406C93.6465 20.4288 97.0142 16.9653 102.132 16.9653C106.49 16.9653 109.197 19.3733 109.891 23.1997H106.16C105.698 21.2205 104.278 20 102.066 20C99.1933 20 97.3113 22.309 97.3113 25.6406C97.3113 28.9392 99.1933 31.2153 102.066 31.2153C104.245 31.2153 105.698 29.9618 106.127 28.0156H109.891C109.23 31.842 106.358 34.25 102.033 34.25Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n<path d=\"M121.006 17.1632H121.799V20.4948H120.214C117.044 20.4948 116.021 22.9687 116.021 25.5747V34.0521H112.455V17.1632H115.625L116.021 19.7031C116.879 18.2847 118.233 17.1632 121.006 17.1632Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n<path d=\"M130.614 16.9653C135.104 16.9653 137.679 19.1094 137.679 23.1007V34.0521H134.576L134.279 31.6441C133.123 33.1615 131.505 34.25 128.831 34.25C125.133 34.25 122.657 32.4358 122.657 29.3021C122.657 25.8385 125.166 23.8924 129.92 23.8924H134.147V22.8698C134.147 20.9896 132.793 19.8351 130.449 19.8351C128.336 19.8351 126.916 20.8247 126.652 22.309H123.152C123.515 19.0104 126.355 16.9653 130.614 16.9653ZM129.425 31.4792C132.397 31.4792 134.114 29.7309 134.147 27.125V26.5312H129.722C127.51 26.5312 126.289 27.3559 126.289 29.0712C126.289 30.4896 127.477 31.4792 129.425 31.4792Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n<path d=\"M144.653 34.0521L139.139 17.1632H142.903L146.766 30.0937L150.629 17.1632H153.897L157.595 30.0937L161.59 17.1632H165.222L159.609 34.0521H155.779L152.214 22.5729L148.516 34.0521H144.653Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n<path d=\"M166.934 34.0521V10.9618H170.5V34.0521H166.934Z\" fill=\"white\" style=\"fill:white;fill-opacity:1;\"/>\n</svg>",
};

function VendorLogo({ id, name }: { id: keyof typeof VENDOR_LOGOS; name: string }) {
  return <span className={`vendor-logo vendor-logo-${id}`}><img src={`data:image/svg+xml,${encodeURIComponent(VENDOR_LOGOS[id])}`} alt={name} /></span>;
}

const MAKERS = [
  { id: "convex", name: "Convex", job: "Keeps the whole room in sync.", color: "trip" },
  { id: "openai", name: "OpenAI", job: "Reads what comes in and finds its place.", color: "card" },
  { id: "agentmail", name: "AgentMail", job: "Gives each mail-enabled space its inbox.", color: "couple" },
  { id: "firecrawl", name: "Firecrawl", job: "Turns a link into something useful.", color: "crew" },
] as const;

const CONVEX_WORK = [
  ["static-hosting", "The app lives here, too. Open tabs know when a new version lands."],
  ["presence + aggregate", "Who’s here, poll tallies, and member counts."],
  ["workflow + workpool", "The weekly digest and the work behind room recaps."],
  ["agent + rag", "Answers grounded in what’s on the board."],
  ["action-retrier + action-cache", "Retries and caching for the room’s outside calls."],
  ["rate-limiter + sharded-counter", "Usage limits and the live totals on this page."],
];

function LiveTotals() {
  const totals = useQuery(api.stats.getLiveTotals, {});
  if (!totals) return null;
  return (
    <div className="about-live">
      <span className="about-live-label"><i /> across ourspaces, right now</span>
      <dl>
        {[
          ["spaces", totals.spaces],
          ["things on boards", totals.widgets],
          ["messages", totals.messages],
        ].map(([label, value]) => (
          <div key={label}><dd>{value.toLocaleString()}</dd><dt>{label}</dt></div>
        ))}
      </dl>
    </div>
  );
}

function BoardPreview() {
  const [vote, setVote] = useState<string>();
  return (
    <div className="about-preview">
      <div className="about-board-frame">
        <div className="about-board">
          <span className="about-board-label">Maya’s birthday club <span>✳</span></span>
          <figure className="about-photo">
            <img src="/assets/the-crew-snapshot.jpg" alt="six friends around a cafe table" />
            <figcaption>same people, next friday.</figcaption>
          </figure>
          <img className="about-ours" src="/assets/stickers/ours.png" alt="“ours” bubble sticker" />
          <div className="about-preview-poll">
            <PollWidget
              widget={{ ...CAKE_POLL, rotate: 0, data: { ...CAKE_POLL.data, waitingOn: [] } }}
              style={{ width: "100%", height: "100%" }}
              selectedOptionId={vote}
              onVote={(option) => setVote(option)}
            />
          </div>
          <div className="about-note">
            <span>the very important plan</span>
            <p>show up.<br />bring something.<br /><strong>stay a little longer.</strong></p>
            <small>— all of us</small>
          </div>
          <img className="about-cake" src="/assets/stickers/matcha-cake.png" alt="matcha layer cake with candles" />
          <span className="about-board-tag">a plan worth keeping.</span>
        </div>
      </div>
      <p className={`about-preview-caption${vote ? " has-vote" : ""}`}>
        <span>{vote ? "✓" : "↖"}</span>
        {vote ? "your vote is in. that’s how easy it is." : "a little preview. go on, pick a cake."}
      </p>
    </div>
  );
}

function AboutOverview() {
  const backHash = normalSpaceHash(lastSpaceSlug());
  const showRooms = () => document.getElementById("about-rooms")?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  });

  return (
    <main className="about-page">
      <nav className="about-bar about-wrap">
        <a className="about-brand" href="#/about">
          <img src="/assets/ourspace-mark.png" alt="" />
          <span>ourspaces</span>
          <small>about</small>
        </a>
        <a className="about-back" href={backHash}><span>←</span> back to the space</a>
      </nav>

      <header className="about-hero about-wrap">
        <div className="about-hero-copy">
          <p className="about-intro">a little corner of the internet, together.</p>
          <h1>Your people.<br />Your plans.<br /><span>Your space.</span></h1>
          <p className="about-lede">
            The photos. The Friday plan. That link someone swears they sent.
            A shared canvas for everything that makes your group <em>your group.</em>
          </p>
          <div className="about-hero-actions">
            <a className="about-button" href="#/space/crew">step into the crew <span>↗</span></a>
            <button className="about-text-button" onClick={showRooms}>take a look around <span>↓</span></button>
          </div>
          <p className="about-invitation">Walk in. Pick a room. Make yourself at home.</p>
        </div>
        <BoardPreview />
      </header>

      <section className="about-made about-wrap" id="about-makers">
        <div className="about-section-heading"><h2>A little help<br />behind the scenes.</h2><p>The room does the remembering.<br />These are the things that make it work.</p></div>
        <div className="about-makers">
          {MAKERS.map((maker) => <a key={maker.name} href={`#/about/${maker.id}`} className="about-maker-link"><VendorLogo id={maker.id} name={maker.name} /><p>{maker.job}</p><small>see how it works <span>↗</span></small></a>)}
        </div>
        <details className="about-under-hood">
          <summary>For the curious: under the hood <span>+</span></summary>
          <div className="about-tech">
            <p>Convex runs the database, live subscriptions, scheduling, file storage, authentication, and hosting. React, Vite, and Tailwind build what you see.</p>
            <dl>{CONVEX_WORK.map(([name, job]) => <div key={name}><dt>{name}</dt><dd>{job}</dd></div>)}</dl>
            <a href={REPO_URL} target="_blank" rel="noreferrer">explore the code on GitHub ↗</a>
          </div>
        </details>
      </section>

      {getDataMode() === "live" && <div className="about-wrap"><LiveTotals /></div>}

      <section className="about-how about-wrap">
        <div className="about-how-heading">
          <h2>Good things<br />get lost in<br /><span>the group chat.</span></h2>
          <p>Give them somewhere to stay. A space is one board your whole group can add to, move around, and come back to.</p>
          <img src="/assets/stickers/glad-ur-here.png" alt="“glad ur here” smiley sticker" loading="lazy" />
        </div>
        <div className="about-ways">
          <article>
            <span className="about-way-mark" style={{ "--way-color": "var(--color-couple)" } as CSSProperties}>↗</span>
            <div><h3>Turn “we should” into a plan.</h3><p>Pick a date. Vote on the cake. Claim what you’re bringing. Everyone sees the same board, as it happens.</p><span className="about-way-note">the poll, the potluck, the countdown</span></div>
          </article>
          <article>
            <span className="about-way-mark" style={{ "--way-color": "var(--color-trip)" } as CSSProperties}>↙</span>
            <div><h3>Send it over. It finds a home.</h3><p>Drop a link or email the space. A receipt joins the expenses. A good read lands in the pile. A little note tells you why.</p><span className="about-way-note">your space has an inbox, too</span></div>
          </article>
          <article>
            <span className="about-way-mark" style={{ "--way-color": "var(--color-crew)" } as CSSProperties}>✳</span>
            <div><h3>Leave a little bit of yourselves.</h3><p>The photo nobody should forget. Your very specific playlist. An inside joke with too much history. Put it all up.</p><span className="about-way-note">move it, stick it, make it yours</span></div>
          </article>
        </div>
      </section>

      <section className="about-rooms about-wrap" id="about-rooms">
        <div className="about-section-heading">
          <h2>Every kind of <span>us.</span></h2>
          <p>Five spaces to wander into.<br />A different kind of together in each one.</p>
        </div>
        <div className="about-room-list">
          {ROOMS.map((room, i) => (
            <a key={room.slug} className="about-room" href={normalSpaceHash(room.slug)} style={{ "--room-color": `var(--color-${room.color})`, "--i": i } as CSSProperties}>
              <span className="about-room-picture">{room.image ? <img src={room.image} alt={`${room.label} space cover`} loading="lazy" /> : <span>{room.symbol}</span>}</span>
              <span className="about-room-name">{room.label}</span>
              <span className="about-room-detail">{room.detail}</span>
              <span className="about-room-arrow">↗</span>
            </a>
          ))}
        </div>
        <a className="about-wall-link" href="#/wall">And a whole wall of things to put in them. <span>see the widgets ↗</span></a>
      </section>

      <section className="about-story">
        <div className="about-wrap about-story-inner">
          <div className="about-story-title"><span className="about-sticker">a small origin story</span><h2>“Wait, where<br />did we put that?”</h2></div>
          <div className="about-story-copy">
            <p>That was the start. Our group chat kept losing the plan, the photo, the link. We wanted a place that felt like ours, where the good stuff could stick around.</p>
            <p>So Thomas built it, and Holly designed it. Made together for the Convex All Gas hackathon.</p>
            <span className="about-signature">Thomas + Holly <span>↗</span></span>
          </div>
        </div>
      </section>

      <footer className="about-footer about-wrap">
        <div className="about-footer-invite"><h2>There’s room for you.</h2><a className="about-button" href="#/space/crew">come on in <span>↗</span></a></div>
        <div className="about-footer-meta"><a className="about-brand" href="#/about"><img src="/assets/ourspace-mark.png" alt="" /><span>ourspaces</span></a><span>group chats forget. spaces remember.</span><a href={REPO_URL} target="_blank" rel="noreferrer">made in the open ↗</a></div>
      </footer>
    </main>
  );
}

export default About;

// These pages document this app's integrations. Examples are local and never
// invoke an outside service; source links point to the implementation.
type VendorId = "convex" | "openai" | "agentmail" | "firecrawl";
type VendorDetail = [title: string, description: string, source: string];
type VendorStory = {
  id: VendorId;
  name: string;
  color: string;
  role: string;
  headline: [string, string];
  intro: string;
  example: string;
  room: string;
  roomLabel: string;
  journeyTitle: string;
  journey: VendorDetail[];
  capabilities: VendorDetail[];
  technical: VendorDetail[];
};

const VENDORS: VendorStory[] = [
  {
    id: "convex", name: "Convex", color: "trip", role: "the shared foundation",
    headline: ["One room.", "Everyone’s there."],
    intro: "A vote, a moved note, a photo someone just put up. Convex keeps the room the same for everyone—and keeps it there when everyone leaves.",
    example: "An interactive example: two views of the same board.",
    room: "crew", roomLabel: "step into the crew",
    journeyTitle: "Follow one vote.",
    journey: [
      ["You pick the cake.", "The poll sends your choice to a Convex mutation.", "convex/votes.ts"],
      ["The vote is saved.", "The mutation checks the poll and updates your vote and its aggregate tally together.", "convex/votes.ts"],
      ["The room hears about it.", "The subscribed results query updates when its underlying records change.", "src/live/useLivePoll.ts"],
      ["Everyone sees the choice.", "The poll renders the new count, faces, and your selected option.", "src/widgets/core.tsx"],
    ],
    capabilities: [
      ["The board is shared state.", "Widgets, messages, votes, and claims live in Convex. React reads subscriptions to those records, so a saved change can reach every open room without a refresh.", "convex/widgets.ts"],
      ["You can feel who’s here.", "The presence component tracks room occupancy. A separate cursor and gesture path carries positions and movements across the canvas, making a shared room feel occupied.", "convex/roomPresence.ts"],
      ["The room keeps working.", "A durable workflow assembles the weekly email. A workpool limits concurrent recap jobs. Scheduled work refreshes old link cards in batches.", "convex/digest.ts"],
      ["Even this page lives here.", "Convex provides file storage and hosts the built frontend. A subscribed deployment record lets an open tab know a newer version is available.", "src/components/UpdateNudge.tsx"],
    ],
    technical: [
      ["Tallies and totals", "Two aggregate instances maintain poll tallies and member counts. A sharded counter supplies the site’s totals. The visible poll also reads individual vote rows because it needs to show the people behind each choice.", "convex/votes.ts"],
      ["Outside calls", "ActionCache reuses scraped links; ActionRetrier wraps transient external calls. RateLimiter controls expensive paths. These components sit around real mail, scraping, and recap operations.", "convex/firecrawl.ts"],
      ["Background work", "Workflow carries the weekly digest through its steps; Workpool bounds recap fan-out; BatchWorker drains the stale-link queue. Crons start the recurring work.", "convex/crons.ts"],
      ["AI and retrieval", "Agent stores the room’s follow-up thread. RAG retrieves relevant board context. PersistentTextStreaming is mounted for the streaming endpoint; the main recap UI uses its existing response path.", "convex/streaming.ts"],
      ["Mail, web, hosting, and identity", "The app mounts the Firecrawl component, a local AgentMail component, StaticHosting, and a local discovery-document component. Convex Auth handles guest and email-code identity as a library.", "convex/convex.config.ts"],
    ],
  },
  {
    id: "openai", name: "OpenAI", color: "league", role: "the room’s sense of context",
    headline: ["Good stuff in.", "Right place found."],
    intro: "The room reads what arrived alongside what’s already on the board. OpenAI models help turn that context into a useful decision—and a little explanation you can see.",
    example: "Illustrated decisions. Choose a message to see where it belongs.",
    room: "crew", roomLabel: "see the crew’s canvas",
    journeyTitle: "Follow one receipt.",
    journey: [
      ["Read what came in.", "The email’s subject, body, and parsed attachment text form the input.", "convex/inboxRouting.ts"],
      ["Look around the room.", "An inventory describes the existing expenses, itineraries, frames, and countdowns.", "convex/inboxRouting.ts"],
      ["Choose a destination.", "The model returns a JSON decision: update an expense or itinerary, create one, leave mail unfiled, or discard spam.", "convex/inboxRouting.ts"],
      ["Leave the reason with it.", "Convex saves the change and its because sentence. The arrival and the object show what happened.", "convex/inbox.ts"],
    ],
    capabilities: [
      ["It reads against your actual plans.", "A payment for a past trip belongs with that trip’s expenses. A future reservation belongs in an itinerary. The mail router includes the current board inventory so the decision has somewhere concrete to land.", "convex/inboxRouting.ts"],
      ["The explanation stays on the object.", "The same decision includes a short because sentence. It appears with the mail arrival and on the resulting letter, expense, or itinerary, so the group can understand the change.", "src/components/MailArrival.tsx"],
      ["The room can catch you up.", "The recap and weekly digest use board snapshots to compose short updates. Follow-up questions use a persistent agent thread and context retrieved from the room.", "convex/recap.ts"],
      ["Uncertainty has a place, too.", "When the router cannot make a useful decision, mail can remain as an unfiled envelope. The model chooses from a small set of actions; app functions own the actual writes.", "convex/inbox.ts"],
    ],
    technical: [
      ["One model-routing module", "convex/ai.ts sends every model call through the Convex AI Gateway, which the deployment authenticates to with a short-lived credential minted inside the running action, so this app carries no model API key of its own. A Cloudflare proxy and a direct OpenAI key remain as fallbacks selected by configuration, not by automatic failover after an error.", "convex/ai.ts"],
      ["JSON decisions, with app-owned writes", "completeJson asks the gateway for a JSON object, and falls back to prompt-directed JSON on the Cloudflare proxy path, whose model rejects the field. Callers interpret the fields; the expense and itinerary mutations check the target’s room and type before updating it.", "convex/inboxRouting.ts"],
      ["Embeddings and memory", "text-embedding-3-small runs through the same gateway at 1536 dimensions, the size the vector indexes were built for. The RAG component indexes widget summaries and recent messages in a namespace for each space, then retrieves context for a follow-up.", "convex/rag.ts"],
      ["A bounded job for the agent", "The follow-up agent is instructed to answer briefly from the supplied context and cite a real object when useful. It has no canvas-writing role. Mail filing follows the separate structured-decision path.", "convex/agent.ts"],
    ],
  },
  {
    id: "agentmail", name: "AgentMail", color: "couple", role: "the room’s connection to your inbox",
    headline: ["You send a note.", "The room gets it."],
    intro: "The crew, us two, and the build room each have an address. Forward the receipt, send the link, write the letter. AgentMail brings it into the space and carries the reply back.",
    example: "A sample letter, just like the ones that arrive in us two. Tap to open.",
    room: "couple", roomLabel: "visit us two",
    journeyTitle: "Follow one email.",
    journey: [
      ["Send it to the room.", "AgentMail receives the message in the inbox attached to that space.", "convex/agentmail.ts"],
      ["Let the app know.", "A Convex HTTP endpoint receives the webhook. The local component records the event and detects redeliveries.", "convex/http.ts"],
      ["Give it a place.", "The room’s router turns it into a letter, a dropped link, an expense, an itinerary entry, or unfiled mail.", "convex/inbox.ts"],
      ["Write back.", "The app labels the message and attempts a reply in the original thread, telling the sender what happened.", "convex/agentmail.ts"],
    ],
    capabilities: [
      ["An address with somewhere to land.", "A room’s inbox is connected to its canvas. A letter to us two becomes a sealed letter. Links sent to the build room join the pile. The crew’s mail is matched against its existing plans.", "convex/inbox.ts"],
      ["Attachments come along.", "AgentMail supplies download URLs for supported documents. Firecrawl turns those documents into text, so a receipt can still be understood when the entire email body is “see attached.”", "convex/agentmail.ts"],
      ["The room replies in the same thread.", "After filing, the app sends a short acknowledgement and applies the result as a label. The board’s committed change stays saved even if that reply cannot be delivered.", "convex/agentmail.ts"],
      ["The week can come to you.", "The weekly digest workflow gathers a room snapshot, composes an update, and sends it through the same mail integration to the room’s sender list.", "convex/digest.ts"],
      ["It delivers your sign-in code, too.", "AgentMail sends the six-digit email code. Convex Auth verifies it and links the email to the guest identity, so joining can keep the person and their existing activity together.", "convex/otp.ts"],
    ],
    technical: [
      ["A local Convex component", "convex/components/agentMail wraps the inbox, send, reply, and label API calls. Its own tables hold incoming messages and webhook event IDs, keeping the email integration together.", "convex/components/agentMail/lib.ts"],
      ["Verified arrival, deduplicated event", "With a signing secret configured, the HTTP action checks the webhook signature before ingestion. The local component recognizes event IDs it has already recorded so a redelivery does not start the same processing again.", "convex/http.ts"],
      ["Documents, not signature logos", "The attachment path skips inline parts, checks supported document types and size, and limits parsing work per email. If attachment metadata is absent, it fetches the message before deciding there is nothing to read.", "convex/agentmail.ts"],
      ["Email delivery is one part of auth", "The OTP provider generates the code and sends the OurSpaces email through AgentMail. The code lifetime is shared with the email copy; Convex Auth owns verification and sessions.", "convex/otp.ts"],
    ],
  },
  {
    id: "firecrawl", name: "Firecrawl", color: "crew", role: "the room’s way into the web",
    headline: ["A link comes in.", "A good idea stays."],
    intro: "A bare URL is easy to lose. Firecrawl gives the room the title, context, and content behind it—whether you bring one article, a topic to research, or a whole site.",
    example: "Illustrated results. Try a link, a topic, or a whole site.",
    room: "buildroom", roomLabel: "open the build room",
    journeyTitle: "Follow one link.",
    journey: [
      ["Drop it into the pile.", "A pending entry holds the URL and who brought it to the room.", "src/pages/LiveSpace.tsx"],
      ["Read the page.", "Firecrawl returns markdown, a summary, images, and structured page details.", "convex/firecrawl.ts"],
      ["Give the card its context.", "The title, description, cover, and source replace the pending content in the room.", "convex/widgets.ts"],
      ["Keep the useful part.", "The group can read, discuss, and keep a takeaway as a note on the board.", "src/components/ReadingRoom.tsx"],
    ],
    capabilities: [
      ["One link becomes a readable card.", "Scraping asks for the page’s content and structured metadata together. Hacker News story URLs are resolved to their linked article when possible, while retaining the discussion context.", "convex/firecrawl.ts"],
      ["A topic becomes a reading pile.", "Topic search returns a set of web results with titles, descriptions, and sources. The build room gives those results somewhere to be kept and discussed.", "convex/firecrawl.ts"],
      ["A whole site arrives a page at a time.", "A background crawl stores pages in the Firecrawl component. The crawl strip subscribes to the stored results, so people can watch pages arrive and keep the ones they want.", "src/components/CrawlStrip.tsx"],
      ["An attached document becomes readable.", "The mail pipeline passes supported attachment URLs to Firecrawl. Parsed text joins the email body before the mail router decides what to do with it.", "convex/agentmail.ts"],
      ["Older link cards get another look.", "A scheduled batch worker finds stale link cards and sends them through the scraper again. The refresh work is spread into batches rather than one large burst.", "convex/batch.ts"],
    ],
    technical: [
      ["Scrape with structured extraction", "The scraper requests markdown, summary, images, and JSON fields for title, description, image, site, author, and publication date. The app combines those results with page metadata to build the card.", "convex/firecrawl.ts"],
      ["Cache and retry around the call", "An hour-long ActionCache wraps the scraped result. ActionRetrier handles the network operation on a cache miss. A repeated save of the same URL can reuse the existing result.", "convex/firecrawl.ts"],
      ["A crawl is a subscription", "startCrawl begins background work. getCrawlStatus and listCrawlPages expose the component’s persisted results to the UI. The crawl strip uses cursor pagination rather than storing every page in one widget.", "src/components/CrawlStrip.tsx"],
      ["Documents use the scrape path", "AgentMail already provides an attachment URL, so parseDocument uses Firecrawl’s scrape operation with a PDF parser option. It does not call the separate multipart /parse endpoint.", "convex/firecrawl.ts"],
    ],
  },
];

const DECISION_EXAMPLES = [
  { kind: "a receipt", input: "I paid $84 for the Tahoe cabin.", where: "Tahoe expenses", value: "$84", detail: "Sam · cabin share", because: "sam covered his cabin share", label: "receipt" },
  { kind: "a booking", input: "Dinner is booked for November 8 at 7pm.", where: "Trip itinerary", value: "Nov 8", detail: "Dinner · 7pm", because: "nov 8 has a dinner now", label: "booking" },
  { kind: "something unclear", input: "Is this the one we were talking about?", where: "Unfiled letter", value: "Over to you.", detail: "Open it together", because: "not sure which plan this belongs to", label: "unfiled" },
];

function VendorExample({ vendor }: { vendor: VendorStory }) {
  const [choice, setChoice] = useState(0);
  const decision = DECISION_EXAMPLES[choice];
  return (
    <div className={`vendor-example vendor-example-${vendor.id}`}>
      <div className="vendor-example-top"><span>interactive example</span><span>{vendor.name} × ourspaces</span></div>
      {vendor.id === "convex" && <>
        <div className="vendor-twin-boards">
          {["your screen", "their screen"].map((label) => <div className="vendor-mini-board" key={label}>
            <span className="vendor-mini-label">{label}</span>
            <div className={`vendor-moving-note${choice % 2 ? " has-moved" : ""}`}><small>friday’s plan</small><strong>Pizza.<br />7pm.<br />Us.</strong><span>✳</span></div>
            <span className="vendor-board-corner">our very good plans</span>
          </div>)}
        </div>
        <div className="vendor-connection"><span /> one shared canvas <span /></div>
        <button className="vendor-example-button" onClick={() => setChoice(choice + 1)}>{choice % 2 ? "put it back" : "move the note"} <span>↗</span></button>
      </>}
      {vendor.id === "openai" && <>
        <div className="vendor-example-tabs">{DECISION_EXAMPLES.map((item, i) => <button key={item.kind} className={choice === i ? "is-selected" : ""} onClick={() => setChoice(i)}>{item.kind}</button>)}</div>
        <div className="vendor-message-input"><span>✉</span><p>{decision.input}</p></div>
        <span className="vendor-down-arrow">↓</span>
        <div className="vendor-decision" key={decision.kind}><span className="vendor-decision-label">{decision.label} ↗</span><p>{decision.where}</p><strong>{decision.value}</strong><span>{decision.detail}</span><small>{decision.because}</small></div>
      </>}
      {vendor.id === "agentmail" && <>
        <div className="vendor-mail-route"><span>your inbox</span><span>↘</span><span>us two</span></div>
        <div className="vendor-letter-preview">
          <LetterWidget widget={{ ...getSpace("couple").widgets.find((widget) => widget.id === "us-letter")!, rotate: 0, data: { from: "ren", subject: "a little hello", text: "hey you,\n\nI walked past our bakery today. Same window seat, same terrible music. Wish you were here.\n\nSaving you the next croissant.", sealed: true } }} style={{ width: "100%", height: "100%" }} />
        </div>
        <span className="vendor-mail-postscript">a message you can keep.</span>
      </>}
      {vendor.id === "firecrawl" && <>
        <div className="vendor-example-tabs">{["a link", "a topic", "a whole site"].map((label, i) => <button key={label} className={choice === i ? "is-selected" : ""} onClick={() => setChoice(i)}>{label}</button>)}</div>
        <div className="vendor-search-example"><span>{choice === 1 ? "⌕" : "↗"}</span><p>{["a good article someone shared", "small tools for creative people", "a site full of good ideas"][choice]}</p></div>
        <div className={`vendor-reading-pile vendor-reading-pile-${choice}`} key={choice}>
          {(choice === 0 ? ["A good idea, worth keeping."] : choice === 1 ? ["A tiny tool for a big idea", "Making things with friends", "A calmer corner of the web"] : ["The ideas", "The people behind them", "How they made it", "What they’re making next"]).map((title, i) => <div className="vendor-reading-slip" key={title} style={{ "--i": i } as CSSProperties}><span>{["↗", "✳", "↗", "✳"][i]}</span><div><strong>{title}</strong><small>{choice === 0 ? "title · summary · source · cover" : choice === 1 ? "a result to read, discuss, or keep" : "a page found during the crawl"}</small></div><span>↗</span></div>)}
        </div>
        <span className="vendor-pile-label">from out there, to in here.</span>
      </>}
      <p className="vendor-example-caption">{vendor.example}</p>
    </div>
  );
}

function VendorPage({ vendor }: { vendor: VendorStory }) {
  const nextVendor = VENDORS[(VENDORS.indexOf(vendor) + 1) % VENDORS.length];
  return (
    <main className={`about-page vendor-page vendor-${vendor.id}`} style={{ "--vendor-color": `var(--color-${vendor.color})` } as CSSProperties}>
      <nav className="about-bar about-wrap">
        <a className="about-brand" href="#/about"><img src="/assets/ourspace-mark.png" alt="" /><span>ourspaces</span><small>made with</small></a>
        <a className="about-back" href="#/about"><span>←</span> back to about</a>
      </nav>
      <nav className="vendor-nav about-wrap">{VENDORS.map((item) => <a key={item.id} href={`#/about/${item.id}`} className={item.id === vendor.id ? "is-selected" : ""} style={{ "--nav-color": `var(--color-${item.color})` } as CSSProperties}>{item.name}<span>↗</span></a>)}</nav>
      <header className="vendor-hero about-wrap">
        <div className="vendor-hero-copy"><div className="vendor-identity"><VendorLogo id={vendor.id} name={vendor.name} /><p className="vendor-credit">{vendor.role}</p></div><h1>{vendor.headline[0]}<br /><span>{vendor.headline[1]}</span></h1><p className="vendor-intro">{vendor.intro}</p><a className="about-button" href={normalSpaceHash(vendor.room)}>{vendor.roomLabel}<span>↗</span></a><span className="vendor-hero-footnote">See what it makes possible in a real space.</span></div>
        <VendorExample vendor={vendor} />
      </header>
      <section className="vendor-journey about-wrap">
        <div className="about-section-heading"><h2>{vendor.journeyTitle}</h2><p>The path from one small action<br />to something the whole room can use.</p></div>
        <ol>{vendor.journey.map(([title, body, source], i) => <li key={title}><span className="vendor-step-number">{i + 1}</span><h3>{title}</h3><p>{body}</p><a href={`${REPO_URL}/blob/main/${source}`} target="_blank" rel="noreferrer">follow it in the code ↗</a></li>)}</ol>
      </section>
      <section className="vendor-capabilities about-wrap">
        <div className="vendor-section-title"><span>{vendor.name} in OurSpaces</span><h2>Where it<br />shows up.</h2><p>Specific jobs in the app.<br />Each one has a place you can point to.</p></div>
        <div>{vendor.capabilities.map(([title, body, source]) => <article key={title}><h3>{title}</h3><p>{body}</p><a href={`${REPO_URL}/blob/main/${source}`} target="_blank" rel="noreferrer">see the implementation <span>↗</span></a></article>)}</div>
      </section>
      <section className="vendor-technical about-wrap"><div className="about-section-heading"><h2>A closer look.</h2><p>The choices behind the behavior.<br />Open whichever part you’re curious about.</p></div>{vendor.technical.map(([title, body, source]) => <details key={title} className="about-under-hood"><summary>{title}<span>+</span></summary><div className="about-tech"><p>{body}</p><a href={`${REPO_URL}/blob/main/${source}`} target="_blank" rel="noreferrer">{source} ↗</a></div></details>)}</section>
      <footer className="vendor-footer about-wrap"><div><span>One part of a shared place.</span><h2>Meet the rest.</h2></div><a className="vendor-next" href={`#/about/${nextVendor.id}`} style={{ "--next-color": `var(--color-${nextVendor.color})` } as CSSProperties}><span>up next</span><strong>{nextVendor.name}</strong><span>↗</span></a><div className="vendor-footer-links"><a href="#/about">← the OurSpaces story</a><a href={normalSpaceHash(lastSpaceSlug())}>back to your space ↗</a><a href={REPO_URL} target="_blank" rel="noreferrer">made in the open ↗</a></div></footer>
    </main>
  );
}

function vendorFromHash() {
  return window.location.hash.replace(/^#\/?about\/?/, "");
}

export function About() {
  const [vendorId, setVendorId] = useState(vendorFromHash);
  useEffect(() => {
    const onHash = () => setVendorId(vendorFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [vendorId]);
  const vendor = VENDORS.find((item) => item.id === vendorId);
  return vendor ? <VendorPage key={vendor.id} vendor={vendor} /> : <AboutOverview />;
}
