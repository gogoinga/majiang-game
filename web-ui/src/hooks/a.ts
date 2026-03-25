 private initRiverContainers(screen: PIXI.Rectangle) {
    const seats = ["bottom", "right", "top", "left"]; // 对应 0-3 方位
    seats.forEach((pos, idx) => {
      const cont = new PIXI.Container();
      cont.name = pos;
      switch (pos) {
        case "bottom":
          cont.x = screen.width / 2;
          cont.y = screen.height - 150;
          break;
        case "right":
          cont.x = screen.width - 150;
          cont.y = screen.height / 2;
          cont.rotation = Math.PI / 2;
          break;
        case "top":
          cont.x = screen.width / 2;
          cont.y = 150;
          cont.rotation = Math.PI;
          break;
        case "left":
          cont.x = 150;
          cont.y = screen.height / 2;
          cont.rotation = -Math.PI / 2;
          break;
      }
      this.riverContainers[pos] = cont;
      this.addChild(cont);
    });