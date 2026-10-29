# Barcode list

A phone-friendly page that reads every barcode in one photo and copies them as a spreadsheet column.

Take a photo, or choose one from your camera roll. The page outlines each barcode it finds and lists the values in reading order. **Copy** puts one barcode on each line, so a paste in Excel, Google Sheets, or Numbers fills a column. Nothing in the photo is uploaded — decoding happens in the browser.

## Use it on an iPhone

The camera button and the copy button need the page to be opened from an `https://` address (a normal hosted link). Add it to the Home Screen if you want it full screen.

1. Open the page in Safari.
2. Tap **Take photo** and fill the frame with the labels. A sharp, well-lit photo reads more codes than one taken from across the room.
3. Check the list. Tap a row to spot that barcode on the photo, correct a misread, or remove a false one.
4. Tap **Copy**. Paste into a spreadsheet column.

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
