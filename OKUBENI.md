# Halil's Nightmare — Kurulum

## Bilgisayarda oyna
`oyun/index.html` dosyasına çift tıkla (Chrome veya Edge önerilir). Kulaklık tak.
- **WASD** yürü • **Fare** bak (ekrana tıkla) • **Shift** koş • **E** etkileşim • **F** fener
- **Boşluk** (saklanırken) nefesini tut • **1 / 2** seçimler • **Esc** duraklat

## Seslendirme
92 repliğin hepsi gönderdiğin kayıtlardan kesilip `oyun/sesler/` klasörüne kondu (H01.mp3, F01.mp3, K01.mp3 …).
- Furkan'ın satırlarına telefon, Karakoncolos'a canavar, kuyu ve kapı arkası satırlarına yankı/boğukluk efekti eklendi.
- `ses_kontrol.html` dosyasını aç: her repliği yazısıyla yan yana dinleyebilirsin. Uyuşmayan satırın kodunu söylersen düzeltirim.
- Bir repliği yeniden kaydetmek istersen aynı isimle MP3 olarak `oyun/sesler/` klasörüne koyman yeterli.

## Yaratık ve efektler
Karakoncolos artık 3D yaratık modeliyle geliyor (oyunun içine gömülü). Model: "The Boiled One: Horror Game - Boiled One", MG Rips / Sketchfab, CC BY-NC 4.0 — yalnızca ticari olmayan kullanım.
Efektler `oyun/sesler/sfx/` klasöründe; senin "Scary Sound FX" paketinden seçildi, kurt uluması da eklendi. Bu klasörü silme.
Köy evleri senin gönderdiğin "Medieval House 01" modeliyle, zemin "snow_01" kar dokusuyla yapıldı (oyunun içine gömülü). Bu ikisinin lisansını da yayınlamadan önce kontrol et.
Ezan: camiyi ilk gördüğünde (minarenin şerefe ışıkları) kısaltılmış, yankılı ezan başlar.
Ekranın üstündeki şerit pusula yönü gösterir; kırmızı nokta gidilecek yerin hizasıdır.
Akıl sağlığı: sol alttaki kalp ve çubuk. Karanlıkta, fener kapalıyken ve yaratığı gördükçe düşer; lamba ve ocak başında dolar. Düştükçe halüsinasyonlar artar ama öldürmez.
Köy okulu: kuyunun kolu okulda. Sınıftaki fotoğrafa yaklaşıp 'Fotoğrafı incele' de.
Ayarlar menüsünde Genel Ses, Çevre Sesleri (rüzgâr, ortam), Konuşmalar ve Parlaklık ayrı ayrı ayarlanabilir.

## APK (Android)
1. Bu klasörün içindekileri GitHub'da yeni bir **private** repoya yükle (`.github` dahil).
2. **Actions** → "APK derle" otomatik çalışır (~4 dk) → **HalilsNightmare-apk** indir → telefona kur.
3. Daha önce repo oluşturduysan bu klasördeki her şeyi üzerine yükle (özellikle `oyun/`); Actions yeni APK'yı derler.
   Sabit imza kullanıldığı için yeni APK eskisinin üzerine kurulur, kayıt silinmez.

**Telefon kontrolleri:** sol taraf joystick ile yürü • sağ tarafı sürükleyerek bak • ETKİLEŞ / FENER / KOŞ butonları • saklanırken NEFESİNİ TUT butonu.

## Kaynak kod
`kaynak/` klasöründe. Değişiklikten sonra `cd kaynak && python3 build.py` → `oyun/index.html` yeniden oluşur.
