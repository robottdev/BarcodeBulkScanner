# Barcode list

A phone-friendly page that reads every barcode in a batch of photos and copies them as a spreadsheet column.

Take as many photos as you need, or choose several from your camera roll. Nothing is read while you are still shooting. When you tap **Read**, each photo is scanned in order and the barcodes become one list. **Copy** puts one barcode on each line, so a paste in Excel, Google Sheets, or Numbers fills a column. Nothing in the photos is uploaded — decoding happens in the browser.

## Use it on an iPhone

The camera button and the copy button need the page to be opened from an `https://` address (a normal hosted link). Add it to the Home Screen if you want it full screen.

1. Open the page in Safari.
2. Tap **Take photos**. A live viewfinder stays open, so you can snap a roll of pictures without leaving the page. Tap the shutter for each one, then **Done**. If the live camera cannot open, **Open camera app** uses the normal camera instead, one photo at a time.
3. Or tap **Choose photos** and select several from the library.
4. When you are out of the tight spot, tap **Read**. The page outlines each barcode and lists the values in photo order.
5. Check the list. Tap a row to spot that barcode on its photo, correct a misread, or remove a false one.
6. Tap **Copy**. Paste into a spreadsheet column.

Turn on **Include type** when you also want the symbology (Code 128, QR Code, EAN-13, …) in a second column.

If a code starts with zero and Excel drops that zero, select the column, format it as **Text**, and paste again. The copy is sent as text so Excel usually keeps the zeros. A 12-digit UPC-A is listed as 13 digits, with a 0 in front of the digits printed on the package.

## Run it locally

```bash
npm install
npm run dev
```

Open the Network address Vite prints. On a phone over plain `http`, taking a photo still works; if **Copy** cannot reach the clipboard, the list box is selected so you can copy it from the share menu.

## Publish

```bash
npm install
npm run build
npm start
```

`npm start` serves the built page on `0.0.0.0` and the `PORT` assigned by the host. Photos are still decoded in the browser.

### Railway

Connect this repository and deploy the branch that contains the app. Railway installs dependencies, runs `npm run build`, then `npm start`. The public URL is HTTPS, so the camera and Copy button work in Safari.

If the service settings already contain a start command, set it to `npm start` or clear it so the repository command is used. A command such as `vite` or `vite preview` listens on the wrong port, and Railway reports that the application failed.
