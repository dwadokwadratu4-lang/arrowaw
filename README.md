# 🧭 Czarna Woda – Magiczny Kompas Zamku Piastowskiego (WebGL / GPS)

Interaktywny, mobilny gadżet przeglądarkowy w technologii **WebGL (Three.js)**, łączący czujniki smartfona (**GPS, magnetometr, akcelerometr, wibracje**) oraz syntezę dźwięku (**Web Audio API**) w formie magicznego pojemnika z czarną wodą wskazującego kierunek do **Zamku Piastowskiego w Raciborzu** (`50.0956° N, 18.2219° E`).

🔗 **Uruchom aplikację na żywo (Live Demo):** [https://vercel.app](https://vercel.app)

---

## 🎯 Główne funkcje projektu

* **Nawigacja GPS i Kompas w czasie rzeczywistym:** Obliczanie dokładnego azymutu oraz odległości w kilometrach z aktualnej lokalizacji użytkownika prosto do Zamku Piastowskiego w Raciborzu.
* **Fizyka bursztynowej strzałki i zderzeń ze szkłem:** Półprzezroczysta, fosforyzująca strzałka z bursztynu reaguje na ruch i poziom telefonu. Przy błędnym kierunku uderza grotem o krawędzie ekranu (z dźwiękiem stuknięcia w szkło i mikro-wibracją), a po obraniu właściwego kursu rozbłyska złotym światłem razem z napisem w górnej części ekranu.
* **Interakcja ruchem (Potrząśnięcie / Shake):** W stanie spoczynku strzałka tonie w czarnej głębinie; potrząśnięcie telefonem budzi taflę wody i przywołuje wskazówkę na powierzchnię.
* **Ukryty Easter Egg („Dragon Eye”):** Wypływające losowo z głębiny fosforyzujące kule można dotknąć, aby otworzyć gadzie **Smocze Oko** wodzące wzrokiem w stronę zamku (podwójne stuknięcie płoszy wszystkie obiekty pod wodę na 5 sekund).
* **Tryb symulacji PC oraz PWA:** Automatyczny panel testowy (suwak obrotu `0°–360°` i przycisk potrząśnięcia) na komputerach stacjonarnych oraz pełnoekranowa instalacja na telefonie (PWA z ikoną Smoczego Oka i inicjałami `AW`).

## 🛠️ Technologie

* **Frontend & Grafika 3D:** React, TypeScript, Vite, Three.js
* **Sensory mobilne & Audio:** Geolocation API, DeviceOrientation & DeviceMotion API, Vibration API, Web Audio API, PWA
* **Wdrożenie:** GitHub + Vercel

---

## 🇬🇧 English Summary

**Black Water – Magical Compass to the Piast Castle (WebGL / GPS)** is an interactive browser-based 3D artifact built with Three.js that uses smartphone sensors (GPS, magnetometer, accelerometer, haptics) and procedural Web Audio to point toward the **Piast Castle in Racibórz, Poland**.

It features a phosphorescent amber needle that taps against the screen edges until aligned with the castle's bearing, shake-to-wake water physics, a hidden interactive **Dragon Eye** easter egg, a desktop simulation fallback, and full-screen PWA support.

---

## 👤 Autor / Author

**Artur Wierzbicki**  
*Koncepcja, projekt i realizacja / Concept, Design & Development*  
🔗 LinkedIn: [://linkedin.com](https://linkedin.com)

📄 Licencja / License: **MIT**
